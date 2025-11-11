import { InfoTooltip } from '@renderer/components/TooltipIcons'
import type { UnstructuredOptions } from '@renderer/types'
import { Checkbox, Input, InputNumber, Select } from 'antd'
import { useTranslation } from 'react-i18next'

import { SettingsItem, SettingsPanel } from './styles'

interface UnstructuredSettingsPanelProps {
  options: UnstructuredOptions
  onChange: (options: UnstructuredOptions) => void
}

const UnstructuredSettingsPanel: React.FC<UnstructuredSettingsPanelProps> = ({ options, onChange }) => {
  const { t } = useTranslation()

  const updateOption = <K extends keyof UnstructuredOptions>(key: K, value: UnstructuredOptions[K]) => {
    onChange({ ...options, [key]: value })
  }

  return (
    <SettingsPanel>
      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.processing_mode')}
          <InfoTooltip title={t('knowledge.unstructured.processing_mode_tooltip')} placement="right" />
        </div>
        <Select
          style={{ width: '100%' }}
          value={options.processingMode || 'fast'}
          onChange={(value) => updateOption('processingMode', value)}
          options={[
            { label: t('knowledge.unstructured.mode_auto'), value: 'auto' },
            { label: t('knowledge.unstructured.mode_fast'), value: 'fast' },
            { label: t('knowledge.unstructured.mode_hi_res'), value: 'hi_res' }
          ]}
        />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.deployment_type')}
          <InfoTooltip title={t('knowledge.unstructured.deployment_type_tooltip')} placement="right" />
        </div>
        <Select
          style={{ width: '100%' }}
          value={options.deploymentType || 'hosted'}
          onChange={(value) => updateOption('deploymentType', value)}
          options={[
            { label: t('knowledge.unstructured.deployment_hosted'), value: 'hosted' },
            { label: t('knowledge.unstructured.deployment_self_hosted'), value: 'self-hosted' }
          ]}
        />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.chunking_strategy')}
          <InfoTooltip title={t('knowledge.unstructured.chunking_strategy_tooltip')} placement="right" />
        </div>
        <Select
          style={{ width: '100%' }}
          value={options.chunkingStrategy || 'by_title'}
          onChange={(value) => updateOption('chunkingStrategy', value)}
          options={[
            { label: t('knowledge.unstructured.chunking_by_title'), value: 'by_title' },
            { label: t('knowledge.unstructured.chunking_by_page'), value: 'by_page' },
            { label: t('knowledge.unstructured.chunking_by_similarity'), value: 'by_similarity' },
            { label: t('knowledge.unstructured.chunking_basic'), value: 'basic' }
          ]}
        />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.max_retries')}
          <InfoTooltip title={t('knowledge.unstructured.max_retries_tooltip')} placement="right" />
        </div>
        <InputNumber
          style={{ width: '100%' }}
          min={1}
          max={10}
          value={options.maxRetries || 3}
          onChange={(value) => updateOption('maxRetries', value || undefined)}
          placeholder="3"
        />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.timeout_ms')}
          <InfoTooltip title={t('knowledge.unstructured.timeout_ms_tooltip')} placement="right" />
        </div>
        <InputNumber
          style={{ width: '100%' }}
          min={5000}
          max={300000}
          step={5000}
          value={options.timeoutMs || 30000}
          onChange={(value) => updateOption('timeoutMs', value || undefined)}
          placeholder="30000"
        />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.max_characters')}
          <InfoTooltip title={t('knowledge.unstructured.max_characters_tooltip')} placement="right" />
        </div>
        <InputNumber
          style={{ width: '100%' }}
          min={100}
          max={10000}
          value={options.maxCharacters || 500}
          onChange={(value) => updateOption('maxCharacters', value || undefined)}
          placeholder="500"
        />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.combine_under_n_chars')}
          <InfoTooltip title={t('knowledge.unstructured.combine_under_n_chars_tooltip')} placement="right" />
        </div>
        <InputNumber
          style={{ width: '100%' }}
          min={50}
          max={5000}
          value={options.combineUnderNChars}
          onChange={(value) => updateOption('combineUnderNChars', value || undefined)}
          placeholder="Auto"
        />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.new_after_n_chars')}
          <InfoTooltip title={t('knowledge.unstructured.new_after_n_chars_tooltip')} placement="right" />
        </div>
        <InputNumber
          style={{ width: '100%' }}
          min={100}
          max={8000}
          value={options.newAfterNChars}
          onChange={(value) => updateOption('newAfterNChars', value || undefined)}
          placeholder="Auto"
        />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.overlap')}
          <InfoTooltip title={t('knowledge.unstructured.overlap_tooltip')} placement="right" />
        </div>
        <InputNumber
          style={{ width: '100%' }}
          min={0}
          max={500}
          value={options.overlap || 0}
          onChange={(value) => updateOption('overlap', value || undefined)}
          placeholder="0"
        />
      </SettingsItem>

      <SettingsItem>
        <Checkbox checked={options.overlapAll || false} onChange={(e) => updateOption('overlapAll', e.target.checked)}>
          {t('knowledge.unstructured.overlap_all')}
        </Checkbox>
        <InfoTooltip title={t('knowledge.unstructured.overlap_all_tooltip')} placement="right" />
      </SettingsItem>

      <SettingsItem>
        <Checkbox
          checked={options.pdfInferTableStructure || false}
          onChange={(e) => updateOption('pdfInferTableStructure', e.target.checked)}>
          {t('knowledge.unstructured.pdf_infer_table_structure')}
        </Checkbox>
        <InfoTooltip title={t('knowledge.unstructured.pdf_infer_table_structure_tooltip')} placement="right" />
      </SettingsItem>

      <SettingsItem>
        <Checkbox
          checked={options.includePageBreaks || false}
          onChange={(e) => updateOption('includePageBreaks', e.target.checked)}>
          {t('knowledge.unstructured.include_page_breaks')}
        </Checkbox>
        <InfoTooltip title={t('knowledge.unstructured.include_page_breaks_tooltip')} placement="right" />
      </SettingsItem>

      <SettingsItem>
        <Checkbox
          checked={options.coordinates || false}
          onChange={(e) => updateOption('coordinates', e.target.checked)}>
          {t('knowledge.unstructured.coordinates')}
        </Checkbox>
        <InfoTooltip title={t('knowledge.unstructured.coordinates_tooltip')} placement="right" />
      </SettingsItem>

      <SettingsItem>
        <div className="settings-label">
          {t('knowledge.unstructured.languages')}
          <InfoTooltip title={t('knowledge.unstructured.languages_tooltip')} placement="right" />
        </div>
        <Input
          style={{ width: '100%' }}
          value={options.languages?.join(', ') || ''}
          onChange={(e) => {
            const value = e.target.value.trim()
            const languages = value
              ? value
                  .split(',')
                  .map((lang) => lang.trim())
                  .filter((lang) => lang.length > 0)
              : undefined
            updateOption('languages', languages)
          }}
          placeholder="eng, spa, fra (comma-separated)"
        />
      </SettingsItem>
    </SettingsPanel>
  )
}

export default UnstructuredSettingsPanel
