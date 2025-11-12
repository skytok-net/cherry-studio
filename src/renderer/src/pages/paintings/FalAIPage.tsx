import { PlusOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { Navbar, NavbarCenter, NavbarRight } from '@renderer/components/app/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import TranslateButton from '@renderer/components/TranslateButton'
import { isMac } from '@renderer/config/constant'
import { getProviderLogo } from '@renderer/config/providers'
import { LanguagesEnum } from '@renderer/config/translate'
import { usePaintings } from '@renderer/hooks/usePaintings'
import { useAllProviders } from '@renderer/hooks/useProvider'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import FileManager from '@renderer/services/FileManager'
import { translateText } from '@renderer/services/TranslateService'
import { useAppDispatch } from '@renderer/store'
import { setGenerating } from '@renderer/store/runtime'
import type { FalAIPainting, PaintingAction } from '@renderer/types'
import { getErrorMessage, uuid } from '@renderer/utils'
import { Avatar, Button, InputNumber, Select, Tooltip } from 'antd'
import TextArea from 'antd/es/input/TextArea'
import { Info } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import SendMessageButton from '../home/Inputbar/SendMessageButton'
import { SettingHelpLink, SettingTitle } from '../settings'
import Artboard from './components/Artboard'
import PaintingsList from './components/PaintingsList'
import ProviderSelect from './components/ProviderSelect'
import { DEFAULT_FAL_AI_PAINTING, FAL_AI_MODELS, type FalAIModel } from './config/falAIConfig'
import { checkProviderEnabled } from './utils'
import FalAIService from './utils/FalAIService'

const logger = loggerService.withContext('FalAIPage')

const FalAIPage: FC<{ Options: string[] }> = ({ Options }) => {
  const [models] = useState<FalAIModel[]>(FAL_AI_MODELS)
  const [selectedModel, setSelectedModel] = useState<FalAIModel | null>(FAL_AI_MODELS[0] || null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [spaceClickCount, setSpaceClickCount] = useState(0)
  const [isTranslating, setIsTranslating] = useState(false)

  const { t } = useTranslation()
  const providers = useAllProviders()
  const { addPainting, removePainting, updatePainting, falai_paintings } = usePaintings()
  const falaiPaintings = falai_paintings
  const [painting, setPainting] = useState<FalAIPainting>(
    falaiPaintings[0] || { ...DEFAULT_FAL_AI_PAINTING, id: uuid() }
  )

  const dispatch = useAppDispatch()
  const { generating } = useRuntime()
  const navigate = useNavigate()
  const location = useLocation()
  const { autoTranslateWithSpace } = useSettings()
  const spaceClickTimer = useRef<NodeJS.Timeout>(null)
  const falaiProvider = providers.find((p) => p.id === 'fal-ai' || p.id === 'falai')
  const textareaRef = useRef<any>(null)
  const falAIService = useMemo(() => {
    if (!falaiProvider?.apiKey) {
      return null
    }
    return new FalAIService(falaiProvider.apiKey, falaiProvider.apiHost)
  }, [falaiProvider])

  const getNewPainting = useCallback(() => {
    return {
      ...DEFAULT_FAL_AI_PAINTING,
      id: uuid(),
      model: selectedModel?.id || FAL_AI_MODELS[0]?.id || ''
    }
  }, [selectedModel])

  const updatePaintingState = useCallback(
    (updates: Partial<FalAIPainting>) => {
      setPainting((prevPainting) => {
        const updatedPainting = { ...prevPainting, ...updates }
        const paintingAction: PaintingAction = {
          ...updatedPainting,
          seed: updatedPainting.seed !== undefined ? String(updatedPainting.seed) : undefined
        }
        updatePainting('falai_paintings', paintingAction)
        return updatedPainting
      })
    },
    [updatePainting]
  )

  const handleError = (error: unknown) => {
    if (error instanceof Error && error.name !== 'AbortError') {
      window.modal.error({
        content: getErrorMessage(error),
        centered: true
      })
    }
  }

  const handleModelChange = (modelId: string) => {
    const model = models.find((m) => m.id === modelId)
    if (model) {
      setSelectedModel(model)
      updatePaintingState({
        model: model.id,
        guidanceScale: model.defaultGuidanceScale,
        numInferenceSteps: model.defaultNumInferenceSteps
      })
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (autoTranslateWithSpace && event.key === ' ') {
      setSpaceClickCount((prev) => prev + 1)

      if (spaceClickTimer.current) {
        clearTimeout(spaceClickTimer.current)
      }

      spaceClickTimer.current = setTimeout(() => {
        setSpaceClickCount(0)
      }, 200)

      if (spaceClickCount === 2) {
        setSpaceClickCount(0)
        setIsTranslating(true)
        translate()
      }
    }
  }

  const handleProviderChange = (providerId: string) => {
    const routeName = location.pathname.split('/').pop()
    if (providerId !== routeName) {
      navigate('../' + providerId, { replace: true })
    }
  }

  const onSelectPainting = (newPainting: PaintingAction) => {
    if (generating) return
    // Find the original painting from state to preserve original types
    const originalPainting = falaiPaintings.find((p) => p.id === newPainting.id) || (newPainting as FalAIPainting)
    setPainting(originalPainting)

    // Set selected model if available
    if (originalPainting.model) {
      const model = models.find((m) => m.id === originalPainting.model)
      if (model) {
        setSelectedModel(model)
      }
    } else {
      setSelectedModel(models[0] || null)
    }
  }

  const translate = async () => {
    if (isTranslating) {
      return
    }

    if (!painting.prompt) {
      return
    }

    try {
      setIsTranslating(true)
      const translatedText = await translateText(painting.prompt, LanguagesEnum.enUS)
      updatePaintingState({ prompt: translatedText })
    } catch (error) {
      logger.error('Translation failed:', error as Error)
    } finally {
      setIsTranslating(false)
    }
  }

  useEffect(() => {
    if (falaiPaintings.length === 0) {
      const newPainting = getNewPainting()
      const paintingAction: PaintingAction = {
        ...newPainting,
        seed: newPainting.seed !== undefined ? String(newPainting.seed) : undefined
      }
      addPainting('falai_paintings', paintingAction)
      setPainting(newPainting)
    }
  }, [falaiPaintings, addPainting, getNewPainting])

  useEffect(() => {
    const timer = spaceClickTimer.current
    return () => {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [])

  useEffect(() => {
    if (painting.status === 'processing' && painting.generationId && selectedModel && falAIService) {
      falAIService
        .pollGenerationResult(selectedModel.id, painting.generationId, {
          onStatusUpdate: (updates) => {
            logger.debug('Polling status update:', updates)
            updatePaintingState(updates)
          }
        })
        .then((result) => {
          if (result && result.images && result.images.length > 0) {
            const urls = result.images.map((img) => img.url)
            falAIService.downloadImages(urls).then(async (validFiles) => {
              await FileManager.addFiles(validFiles)
              updatePaintingState({ files: validFiles, urls, status: 'succeeded' })
            })
          }
        })
        .catch((error) => {
          logger.error('Polling failed:', error)
          updatePaintingState({ status: 'failed' })
        })
    }
  }, [painting.generationId, painting.status, selectedModel, falAIService, updatePaintingState])

  const onGenerate = async () => {
    if (!falaiProvider) {
      window.modal.error({
        content: t('error.provider_not_found'),
        centered: true
      })
      return
    }

    await checkProviderEnabled(falaiProvider, t)

    if (painting.files.length > 0) {
      const confirmed = await window.modal.confirm({
        content: t('paintings.regenerate.confirm'),
        centered: true
      })

      if (!confirmed) return
      await FileManager.deleteFiles(painting.files)
    }

    const prompt = textareaRef.current?.resizableTextArea?.textArea?.value || ''

    if (!selectedModel || !prompt || !falAIService) {
      window.modal.error({
        content: t('paintings.text_desc_required'),
        centered: true
      })
      return
    }

    const controller = new AbortController()
    setAbortController(controller)
    setIsLoading(true)
    dispatch(setGenerating(true))

    try {
      const requestBody: Parameters<typeof falAIService.createGeneration>[1] = {
        prompt,
        negative_prompt: painting.negativePrompt || undefined,
        image_size: painting.imageSize || '1024x1024',
        num_inference_steps: painting.numInferenceSteps || selectedModel.defaultNumInferenceSteps,
        guidance_scale: painting.guidanceScale || selectedModel.defaultGuidanceScale,
        seed:
          painting.seed !== undefined
            ? typeof painting.seed === 'string'
              ? Number(painting.seed)
              : painting.seed
            : undefined,
        num_images: painting.numImages || 1
      }

      updatePaintingState({
        model: selectedModel.id,
        prompt,
        status: 'processing'
      })

      const result = await falAIService.generateAndWait(selectedModel.id, requestBody, {
        signal: controller.signal,
        onStatusUpdate: (updates) => {
          updatePaintingState(updates)
        }
      })

      if (result && result.images && result.images.length > 0) {
        const urls = result.images.map((img) => img.url)
        const validFiles = await falAIService.downloadImages(urls)
        await FileManager.addFiles(validFiles)
        updatePaintingState({ files: validFiles, urls, status: 'succeeded', seed: result.seed })
      }

      setIsLoading(false)
      dispatch(setGenerating(false))
      setAbortController(null)
    } catch (error: unknown) {
      handleError(error)
      setIsLoading(false)
      dispatch(setGenerating(false))
      setAbortController(null)
      updatePaintingState({ status: 'failed' })
    }
  }

  const onCancel = () => {
    abortController?.abort()
    setIsLoading(false)
    dispatch(setGenerating(false))
    setAbortController(null)
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % painting.files.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + painting.files.length) % painting.files.length)
  }

  const handleAddPainting = () => {
    const newPainting = getNewPainting()
    const paintingAction: PaintingAction = {
      ...newPainting,
      seed: newPainting.seed !== undefined ? String(newPainting.seed) : undefined
    }
    addPainting('falai_paintings', paintingAction)
    updatePainting('falai_paintings', paintingAction)
    setPainting(newPainting)
    return newPainting
  }

  const onDeletePainting = (paintingToDelete: FalAIPainting) => {
    if (paintingToDelete.id === painting.id) {
      const currentIndex = falaiPaintings.findIndex((p) => p.id === paintingToDelete.id)

      if (currentIndex > 0) {
        setPainting(falaiPaintings[currentIndex - 1])
      } else if (falaiPaintings.length > 1) {
        setPainting(falaiPaintings[1])
      }
    }

    const paintingAction: PaintingAction = {
      ...paintingToDelete,
      seed: paintingToDelete.seed !== undefined ? String(paintingToDelete.seed) : undefined
    }
    removePainting('falai_paintings', paintingAction)
  }

  if (!falaiProvider) {
    return (
      <Container>
        <Navbar>
          <NavbarCenter>{t('paintings.title')}</NavbarCenter>
        </Navbar>
        <ContentContainer>
          <div style={{ padding: '20px', textAlign: 'center' }}>{t('error.provider_not_found')}</div>
        </ContentContainer>
      </Container>
    )
  }

  return (
    <Container>
      <Navbar>
        <NavbarCenter style={{ borderRight: 'none' }}>{t('paintings.title')}</NavbarCenter>
        {isMac && (
          <NavbarRight style={{ justifyContent: 'flex-end' }}>
            <Button size="small" className="nodrag" icon={<PlusOutlined />} onClick={handleAddPainting}>
              {t('paintings.button.new.image')}
            </Button>
          </NavbarRight>
        )}
      </Navbar>
      <ContentContainer id="content-container">
        <LeftContainer>
          {/* Provider Section */}
          <ProviderTitleContainer>
            <SettingTitle style={{ marginBottom: 8 }}>{t('common.provider')}</SettingTitle>
            <SettingHelpLink target="_blank" href="https://fal.ai">
              {t('paintings.learn_more')}
              <ProviderLogo shape="square" src={getProviderLogo('fal-ai')} size={16} style={{ marginLeft: 5 }} />
            </SettingHelpLink>
          </ProviderTitleContainer>

          <ProviderSelect provider={falaiProvider} options={Options} onChange={handleProviderChange} />

          {/* Model Selection */}
          <SectionTitle style={{ marginBottom: 5, marginTop: 15 }}>{t('paintings.model')}</SectionTitle>
          <Select
            style={{ width: '100%', marginBottom: 12 }}
            value={selectedModel?.id}
            onChange={handleModelChange}
            placeholder={t('paintings.select_model')}>
            {Object.entries(
              models.reduce(
                (acc, model) => {
                  const group = model.group || 'Other'
                  if (!acc[group]) {
                    acc[group] = []
                  }
                  acc[group].push(model)
                  return acc
                },
                {} as Record<string, typeof models>
              )
            ).map(([group, groupModels]) => (
              <Select.OptGroup key={group} label={group}>
                {groupModels.map((model) => (
                  <Select.Option key={model.id} value={model.id}>
                    <ModelOptionContainer>
                      <ModelName>{model.name}</ModelName>
                    </ModelOptionContainer>
                  </Select.Option>
                ))}
              </Select.OptGroup>
            ))}
          </Select>

          {/* Image Size */}
          {selectedModel && (
            <>
              <SectionTitle style={{ marginBottom: 5, marginTop: 10 }}>{t('paintings.image.size')}</SectionTitle>
              <Select
                style={{ width: '100%', marginBottom: 12 }}
                value={painting.imageSize || '1024x1024'}
                onChange={(value) => updatePaintingState({ imageSize: value })}>
                {selectedModel.imageSizes.map((size) => (
                  <Select.Option key={size.value} value={size.value}>
                    {size.value}
                  </Select.Option>
                ))}
              </Select>

              {/* Number of Images */}
              <SectionTitle style={{ marginBottom: 5, marginTop: 10 }}>{t('paintings.number_images')}</SectionTitle>
              <InputNumber
                style={{ width: '100%', marginBottom: 12 }}
                min={1}
                max={selectedModel.maxImages || 4}
                value={painting.numImages || 1}
                onChange={(value) => updatePaintingState({ numImages: value || 1 })}
              />

              {/* Negative Prompt */}
              {selectedModel.supportsNegativePrompt && (
                <>
                  <SectionTitle style={{ marginBottom: 5, marginTop: 10 }}>
                    {t('paintings.negative_prompt')}
                  </SectionTitle>
                  <TextArea
                    style={{ marginBottom: 12 }}
                    rows={3}
                    value={painting.negativePrompt || ''}
                    onChange={(e) => updatePaintingState({ negativePrompt: e.target.value })}
                    placeholder={t('paintings.negative_prompt_tip')}
                  />
                </>
              )}

              {/* Advanced Parameters */}
              <SectionTitle style={{ marginBottom: 5, marginTop: 10 }}>{t('paintings.input_parameters')}</SectionTitle>

              {/* Guidance Scale */}
              {selectedModel.supportsGuidanceScale && (
                <ParameterField>
                  <ParameterLabel>
                    <ParameterName>
                      {t('paintings.guidance_scale')}
                      <Tooltip title={t('paintings.guidance_scale_tip')}>
                        <InfoIcon />
                      </Tooltip>
                    </ParameterName>
                  </ParameterLabel>
                  <InputNumber
                    style={{ width: '100%', marginBottom: 12 }}
                    min={1}
                    max={20}
                    step={0.1}
                    value={painting.guidanceScale || selectedModel.defaultGuidanceScale || 3.5}
                    onChange={(value) => updatePaintingState({ guidanceScale: value || 3.5 })}
                  />
                </ParameterField>
              )}

              {/* Number of Inference Steps */}
              <ParameterField>
                <ParameterLabel>
                  <ParameterName>
                    {t('paintings.inference_steps')}
                    <Tooltip title={t('paintings.inference_steps_tip')}>
                      <InfoIcon />
                    </Tooltip>
                  </ParameterName>
                </ParameterLabel>
                <InputNumber
                  style={{ width: '100%', marginBottom: 12 }}
                  min={1}
                  max={50}
                  value={painting.numInferenceSteps || selectedModel.defaultNumInferenceSteps || 28}
                  onChange={(value) => updatePaintingState({ numInferenceSteps: value || 28 })}
                />
              </ParameterField>

              {/* Seed */}
              {selectedModel.supportsSeed && (
                <ParameterField>
                  <ParameterLabel>
                    <ParameterName>
                      {t('paintings.seed')}
                      <Tooltip title={t('paintings.seed_tip')}>
                        <InfoIcon />
                      </Tooltip>
                    </ParameterName>
                  </ParameterLabel>
                  <InputNumber
                    style={{ width: '100%', marginBottom: 12 }}
                    min={-1}
                    value={painting.seed}
                    onChange={(value) => updatePaintingState({ seed: value ?? undefined })}
                    placeholder={t('paintings.seed_desc_tip')}
                  />
                </ParameterField>
              )}
            </>
          )}
        </LeftContainer>

        <MainContainer>
          <Artboard
            painting={painting}
            isLoading={isLoading}
            currentImageIndex={currentImageIndex}
            onPrevImage={prevImage}
            onNextImage={nextImage}
            onCancel={onCancel}
          />
          <InputContainer>
            <Textarea
              ref={textareaRef}
              variant="borderless"
              disabled={isLoading}
              value={painting.prompt || ''}
              spellCheck={false}
              onChange={(e) => updatePaintingState({ prompt: e.target.value })}
              placeholder={isTranslating ? t('paintings.translating') : t('paintings.prompt_placeholder')}
              onKeyDown={handleKeyDown}
            />
            <Toolbar>
              <ToolbarMenu>
                <TranslateButton
                  text={textareaRef.current?.resizableTextArea?.textArea?.value}
                  onTranslated={(translatedText) => updatePaintingState({ prompt: translatedText })}
                  disabled={isLoading || isTranslating}
                  isLoading={isTranslating}
                  style={{ marginRight: 6, borderRadius: '50%' }}
                />
                <SendMessageButton sendMessage={onGenerate} disabled={isLoading} />
              </ToolbarMenu>
            </Toolbar>
          </InputContainer>
        </MainContainer>

        <PaintingsList
          namespace="falai_paintings"
          paintings={
            falaiPaintings.map((p) => ({
              ...p,
              seed: p.seed !== undefined ? String(p.seed) : undefined
            })) as PaintingAction[]
          }
          selectedPainting={
            {
              ...painting,
              seed: painting.seed !== undefined ? String(painting.seed) : undefined
            } as PaintingAction
          }
          onSelectPainting={onSelectPainting}
          onDeletePainting={onDeletePainting as any}
          onNewPainting={handleAddPainting}
        />
      </ContentContainer>
    </Container>
  )
}

const SectionTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
`

const ModelOptionContainer = styled.div`
  display: flex;
  flex-direction: column;
`

const ModelName = styled.div`
  color: var(--color-text);
`

const ParameterField = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
`

const ParameterLabel = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 6px;
`

const ParameterName = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  text-transform: capitalize;
`

const InfoIcon = styled(Info)`
  margin-left: 5px;
  cursor: help;
  color: var(--color-text-2);
  opacity: 0.6;
  width: 14px;
  height: 16px;

  &:hover {
    opacity: 1;
  }
`

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  height: 100%;
  background-color: var(--color-background);
  overflow: hidden;
`

const LeftContainer = styled(Scrollbar)`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  background-color: var(--color-background);
  max-width: var(--assistants-width);
  border-right: 0.5px solid var(--color-border);
`

const MainContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-background);
`

const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 95px;
  max-height: 95px;
  position: relative;
  border: 1px solid var(--color-border-soft);
  transition: all 0.3s ease;
  margin: 0 20px 15px 20px;
  border-radius: 10px;
`

const Textarea = styled(TextArea)`
  padding: 10px;
  border-radius: 0;
  display: flex;
  flex: 1;
  resize: none !important;
  overflow: auto;
  width: auto;
`

const Toolbar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  justify-content: flex-end;
  padding: 0 8px;
  padding-bottom: 0;
  height: 40px;
`

const ToolbarMenu = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
`

const ProviderLogo = styled(Avatar)`
  border: 0.5px solid var(--color-border);
`

const ProviderTitleContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
`

export default FalAIPage
