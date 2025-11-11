import { useTranslation } from 'react-i18next'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const RerankerTag = ({ size, ...restProps }: Props) => {
  const { t } = useTranslation()
  return (
    <CustomTag
      size={size}
      color="var(--color-secondary-beige-dark, #D2B48C)"
      icon={t('models.type.rerank')}
      {...restProps}
    />
  )
}
