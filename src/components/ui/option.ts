/**
 * 选项接口：label 为显示文本，value 为实际值。
 * 支持附加自定义属性（[key: string]: any）。
 */
export interface Option {
  label: string
  value: string
  [key: string]: any
}
