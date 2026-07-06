import React from 'react'
import type { Command } from '../../commands.js'
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import NotebookList from './notebook-list.js'
import NotebookView from './notebook-view.js'
import {
  handleCreate,
  handleList,
  handleSearch,
  handleTags,
  formatSingleNote,
  formatPaginated,
  formatTagList,
} from './notebook.js'

// ====== 命令定义（local-jsx 类型） ======

const notebook: Command = {
  type: 'local-jsx',
  name: 'notebook',
  description: '记事本 - 创建、查看、搜索和管理笔记',
  argumentHint: '[create|list|view|edit|delete|pin|search|tags|export]',
  load: () => import('./notebook-ui.js'),
}

export default notebook
