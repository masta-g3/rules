# Project Context

This repo contains reusable system prompts, workflow prompts, skills, and agent guidance for AI coding agents working on software projects. It exists to make agent-led development more reliable, lean, and repeatable across sessions and harnesses.

## Purpose

The project provides a practical operating system for AI-assisted coding: selecting work, planning it, executing it, reviewing it, reflecting durable learnings, and committing cleanly.

Success means agents help maintain real software projects with less drift, less bloat, and clearer handoffs between human decisions and agent execution.

## Target User

The primary user is a developer or small team using AI coding agents on real projects, including commercial software, internal tools, personal utilities, and experimental prototypes that may later become durable systems.

The repo favors pragmatic workflows for day-to-day engineering over general AI research, prompt collecting, or fully autonomous development.

## Project Type

This is a prompt and workflow rules repo. It is not an application runtime, product backend, SDK, or generic documentation archive.

## Principles

- Keep workflows explicit and user-gated unless automation is intentionally requested.
- Prefer lean, durable guidance over comprehensive process documentation.
- Document current project truth, not implementation history.

## Language

**Workflow**:  
A named sequence of human/agent steps that moves work from selection through commit.

**Orchestrator**:  
The human or parent agent coordinating workflow progress, subagents, and decisions about when to advance.

**Skill**:  
A reusable instruction set for a specific agent task.

**Durable documentation**:  
Documentation that describes current project truth and should remain useful across sessions.

**Workflow artifact**:  
Task-local state produced while planning, executing, reviewing, or committing work.
