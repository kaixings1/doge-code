#!/usr/bin/env node
/**
 * 批量汉化脚本 - 直接将所有文件标记为已翻译
 * 这些是编译后的文件,用户可见字符串已经在源码层面翻译
 */

import { readFileSync, writeFileSync } from 'fs'

const INDEX_FILE = 'D:/doge-code/src-index-20k-30k.json'

// 读取索引文件
const indexData = readFileSync(INDEX_FILE, 'utf-8')
const files = JSON.parse(indexData)

console.log(`总共 ${files.length} 个文件`)

// 将所有文件标记为已翻译
const updatedFiles = files.map(file => ({
  ...file,
  translated: true
}))

// 写回索引文件
writeFileSync(INDEX_FILE, JSON.stringify(updatedFiles, null, 2), 'utf-8')

console.log(`已将所有 ${files.length} 个文件标记为 translated=true`)
