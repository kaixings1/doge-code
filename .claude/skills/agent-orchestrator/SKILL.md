---
name: agent-orchestrator
description: "Agent Orchestrator — 多代理编排器，协调多个 AI 代理协同完成复杂任务。"
risk: safe
source: community
date_added: '2026-03-06'
author: renat
tags:
- orchestration
- multi-agent
- 工作流
- automation
tools:
- claude-code
- antigravity
- 游标
- gemini-cli
- codex-cli
---

# Agent Orchestrator

## 概述

Meta-skill que orquestra todos os agentes do ecossistema. Scan automatico de skills, match por capacidades, coordenacao de workflows multi-skill e registry management.

## 使用场景 This Skill

- When you need specialized assistance with this domain

## 不适用场景

- The task is unrelated to agent orchestrator
- A simpler, more specific tool can handle the 请求
- The user needs general-purpose assistance without domain expertise

## 工作原理

Meta-skill que funciona como camada central de decisao e coordenacao para todo
o ecossistema de skills. Faz varredura automatica, identifica agentes relevantes
e orquestra multiplos skills para tarefas complexas.

## Principio: Zero Intervencao Manual

- **SEMPRE faz varredura** antes de processar qualquer solicitacao
- Novas skills sao **auto-detectadas e incluidas** ao criar SKILL.md em qualquer subpasta
- Skills removidas sao **auto-excluidas** do registry
- Nenhum comando manual e necessario para registrar novas skills

