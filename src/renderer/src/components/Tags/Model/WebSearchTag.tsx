import { GlobalOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const WebSearchTag = ({ size, showTooltip, showLabel, ...restProps }: Props) => {
  const { t } = useTranslation()

  return (
    <CustomTag
      size={size}
      color="var(--color-primary-flame, #FF6B35)"
      icon={<GlobalOutlined style={{ fontSize: size }} />}
      tooltip={showTooltip ? t('models.type.websearch') : undefined}
      {...restProps}>
      {showLabel ? t('models.type.websearch') : ''}
    </CustomTag>
  )
}
