---
name: 开发者增长分析
description: "开发者增长分析 — 开发者增长分析相关功能和最佳实践"
---

# 开发者成长分析

此技能通过分析您的 Claude Code 聊天交互并识别揭示优势和成长领域的模式，为您最近的编码工作提供个性化反馈。

## 何时使用此技能

当您想要以下内容时使用此技能：
- 从近期工作中了解您的开发模式和习惯
- 识别特定的技术差距或反复出现的挑战
- 发现哪些主题值得深入学习
- 获取根据您实际工作模式定制的学习资源
- 跟踪近期项目的改进领域
- 找到直接针对您正在发展的技能的高质量文章

此技能适合那些希望获得关于其成长的结构化反馈而无需等待代码审查的开发者，以及偏好基于自身工作历史的数据驱动洞察的开发者。

## 此技能的功能

此技能执行 a six-step analysis of your development work:

1. **Reads Your Chat History**: Accesses your local Claude Code chat history from the past 24-48 hours to understand what you've been working on.

2. **Identifies Development Patterns**: Analyzes the types of problems you're solving, technologies you're using, challenges you encounter, and how you 方法 different kinds of tasks.

3. **Detects Improvement Areas**: Recognizes patterns that suggest skill gaps, repeated struggles, inefficient approaches, or areas where you might benefit from deeper knowledge.

4. **Generates a Personalized Report**: Creates a comprehensive report showing your work summary, identified improvement areas, and specific recommendations for growth.

5. **Finds Learning Resources**: Uses HackerNews to curate high-quality articles and discussions directly relevant to your improvement areas, providing you with a reading list tailored to your actual development work.

6. **Sends to Your Slack DMs**: Automatically delivers the complete report to your own Slack direct messages so you can reference it anytime, anywhere.

## 使用方法

Ask Claude to analyze your recent coding work:

```
Analyze my developer growth from my recent chats
```

Or be more specific about which time period:

```
Analyze my work from today and suggest areas for improvement
```

The skill will generate a formatted report with:
- 概述 of your recent work
- Key improvement areas identified
- Specific recommendations for each area
- Curated learning resources from HackerNews
- Action items you can focus on

## 使用说明

When a user requests analysis of their developer growth or coding patterns from recent work:

1. **Access Chat History**

   Read the chat history from `~/.claude/history.jsonl`. This file is a JSONL format where each line contains:
   - `display`: The user's message/请求
   - `project`: The project being worked on
   - `timestamp`: Unix timestamp (in milliseconds)
   - `pastedContents`: Any code or content pasted

   过滤器 for entries from the past 24-48 hours based on the current timestamp.

2. **Analyze Work Patterns**

   Extract and analyze the following from the filtered chats:
   - **Projects and Domains**: What types of projects was the user working on? (e.g., backend, frontend, DevOps, data, etc.)
   - **Technologies Used**: What languages, frameworks, and tools appear in the conversations?
   - **Problem Types**: What categories of problems are being solved? (e.g., performance optimization, debugging, feature implementation, refactoring, 设置/配置)
   - **Challenges Encountered**: What problems did the user struggle with? Look for:
     - Repeated questions about similar topics
     - Problems that took multiple attempts to solve
     - Questions indicating knowledge gaps
     - Complex architectural decisions
   - **方法 Patterns**: How does the user solve problems? (e.g., methodical, exploratory, experimental)

3. **Identify Improvement Areas**

   Based on the analysis, identify 3-5 specific areas where the user could improve. These should be:
   - **Specific** (not vague like "improve coding skills")
   - **Evidence-based** (grounded in actual chat history)
   - **Actionable** (practical improvements that can be made)
   - **Prioritized** (most impactful first)

   示例 of good improvement areas:
   - "Advanced TypeScript patterns (generics, utility types, type guards) - you struggled with type safety in [specific project]"
   - "Error handling and validation - I noticed you patched several bugs related to missing null checks"
   - "Async/await patterns - your recent work shows some race conditions and timing issues"
   - "Database 查询 optimization - you rewrote the same 查询 multiple times"

4. **Generate Report**

   Create a comprehensive report with this structure:

   ```markdown
   # Your Developer Growth Report

   **Report Period**: [Yesterday / Today / [Custom Date Range]]
   **Last Updated**: [Current Date and Time]

   ## Work Summary

   [2-3 paragraphs summarizing what the user worked on, projects touched, technologies used, and overall focus areas]

   Example:
   "Over the past 24 hours, you focused primarily on backend development with three distinct projects. Your work involved TypeScript, React, and 部署 infrastructure. You tackled a mix of feature implementation, debugging, and architectural decisions, with a particular focus on API design and database optimization."

   ## Improvement Areas (Prioritized)

   ### 1. [Area Name]

   **Why This Matters**: [Explanation of why this skill is important for the user's work]

   **What I Observed**: [Specific evidence from chat history showing this gap]

   **Recommendation**: [Concrete step(s) to improve in this area]

   **Time to Skill Up**: [Brief estimate of effort required]

   ---

   [Repeat for 2-4 additional areas]

   ## Strengths Observed

   [2-3 bullet points highlighting things you're doing well - things to continue doing]

   ## Action Items

   Priority order:
   1. [Action item derived from highest priority improvement area]
   2. [Action item from next area]
   3. [Action item from next area]

   ## Learning Resources

   [Will be populated in next step]
   ```

5. **Search for Learning Resources**

   Use Rube MCP to search HackerNews for articles related to each improvement area:

   - For each improvement area, construct a search 查询 targeting high-quality resources
   - Search HackerNews using RUBE_SEARCH_TOOLS with queries like:
     - "Learn [Technology/Pattern] 最佳实践"
     - "[Technology] advanced patterns and techniques"
     - "Debugging [specific problem type] in [language]"
   - Prioritize posts with high engagement (comments, upvotes)
   - For each area, include 2-3 most relevant articles with:
     - Article title
     - Publication date
     - Brief description of why it's relevant
     - Link to the article

   Add this section to the report:

   ```markdown
   ## Curated Learning Resources

   ### For: [Improvement Area]

   1. **[Article Title]** - [Date]
      [Description of what it covers and why it's relevant to your improvement area]
      [Link]

   2. **[Article Title]** - [Date]
      [Description]
      [Link]

   [Repeat for other improvement areas]
   ```

6. **Present the Complete Report**

   Deliver the report in a clean, readable format that the user can:
   - Quickly scan for key takeaways
   - Use for focused learning planning
   - Reference over the next week as they work on improvements
   - Share with mentors if they want external feedback

7. **Send Report to Slack DMs**

   Use Rube MCP to send the complete report to the user's own Slack DMs:

   - Check if Slack connection is active via RUBE_SEARCH_TOOLS
   - If not connected, use RUBE_MANAGE_CONNECTIONS to initiate Slack auth
   - Use RUBE_MULTI_EXECUTE_TOOL to send the report as a formatted message:
     - Send the report title and period as the first message
     - Break the report into logical sections (总结, Improvements, Strengths, Actions, Resources)
     - Format each section as a well-structured Slack message with proper markdown
     - Include clickable links for the learning resources
   - Confirm delivery in the CLI output

   This ensures the user has the report in a place they check regularly and can reference it throughout the week.

## Example 用法

### Input

```
Analyze my developer growth from my recent chats
```

### Output

```markdown
# Your Developer Growth Report

**Report Period**: November 9-10, 2024
**Last Updated**: November 10, 2024, 9:15 PM UTC

## Work Summary

Over the past two days, you focused on backend infrastructure and API development. Your primary project was an open-source showcase application, where you made significant progress on connections management, UI improvements, and 部署 配置. You worked with TypeScript, React, and Node.js, tackling challenges ranging from data security to responsive design. Your work shows a balance between implementing features and addressing technical debt.

## Improvement Areas (Prioritized)

### 1. Advanced TypeScript Patterns and Type Safety

**Why This Matters**: TypeScript is central to your work, but leveraging its advanced features (generics, utility types, conditional types, type guards) can significantly improve code reliability and reduce runtime errors. Better type safety catches bugs at compile time rather than in production.

**What I Observed**: In your recent chats, you were working with connection data structures and struggled a few times with typing auth configurations properly. You also had to iterate on union types for different connection states. There's an opportunity to use discriminated unions and type guards more effectively.

**Recommendation**: Study TypeScript's advanced type system, particularly utility types (Omit, Pick, Record), conditional types, and discriminated unions. Apply these patterns to your connection 配置 handling and auth state management.

**Time to Skill Up**: 5-8 hours of focused learning and practice

### 2. Secure Data Handling and Information Hiding in UI

**Why This Matters**: You identified and fixed a security concern where sensitive connection data was being displayed in your console. Preventing information leakage is critical for applications handling user credentials and API keys. Good practices here prevent security incidents and user trust violations.

**What I Observed**: You caught that your "Your Apps" page was showing full connection data including auth configs. This shows good security instincts, and the next step is building this into your default thinking when handling sensitive information.

**Recommendation**: Review security 最佳实践 for handling sensitive data in frontend applications. Create reusable patterns for filtering/masking sensitive information before displaying it. Consider implementing a secure data layer that explicitly whitelist what can be shown in the UI.

**Time to Skill Up**: 3-4 hours

### 3. Component Architecture and Responsive UI Patterns

**Why This Matters**: You're designing UIs that need to work across different screen sizes and user interactions. Strong component architecture makes it easier to build complex UIs without bugs and improves maintainability.

**What I Observed**: You worked on the "Marketplace" UI (formerly Browse Tools), recreating it from a design image. You also identified and fixed scrolling issues where content was overflowing containers. There's an opportunity to strengthen your understanding of layout containment and responsive design patterns.

**Recommendation**: Study React component composition patterns and CSS layout 最佳实践 (especially flexbox and grid). Focus on container queries and responsive patterns that prevent overflow issues. Look into component composition libraries and design system approaches.

**Time to Skill Up**: 6-10 hours (depending on depth)

## Strengths Observed

- **Security Awareness**: You proactively identified data leakage issues before they became problems
- **Iterative Refinement**: You worked through UI requirements methodically, asking clarifying questions and improving designs
- **Full-Stack Capability**: You comfortably work across backend APIs, frontend UI, and 部署 concerns
- **Problem-Solving 方法**: You break down complex tasks into manageable steps

## Action Items

Priority order:
1. Spend 1-2 hours learning TypeScript utility types and discriminated unions; apply to your connection data structures
2. Document security patterns for your project (what data is safe to display, filtering/masking functions)
3. Study one article on advanced React patterns and apply one pattern to your current UI work
4. Set up a code review checklist focused on type safety and data security for future PRs

## Curated Learning Resources

### For: Advanced TypeScript Patterns

1. **TypeScript's Advanced Types: Generics, Utility Types, and Conditional Types** - HackerNews, October 2024
   Deep dive into TypeScript's type system with practical 示例 and real-world applications. Covers discriminated unions, type guards, and patterns for ensuring compile-time safety in complex applications.
   [Link to discussion]

2. **Building Type-Safe APIs in TypeScript** - HackerNews, September 2024
   Practical guide to designing APIs with TypeScript that catch errors early. Particularly relevant for your connection 配置 work.
   [Link to discussion]

### For: Secure Data Handling in Frontend

1. **Preventing Information Leakage in Web Applications** - HackerNews, August 2024
   Comprehensive guide to data security in frontend applications, including filtering sensitive information, secure logging, and audit trails.
   [Link to discussion]

2. **OAuth and API Key Management 最佳实践** - HackerNews, July 2024
   How to safely handle 认证 tokens and API keys in applications, with 示例 for different frameworks.
   [Link to discussion]

### For: Component Architecture and Responsive Design

1. **Advanced React Patterns: Composition Over 配置** - HackerNews
   Explores component composition strategies that scale, with 示例 using modern React patterns.
   [Link to discussion]

2. **CSS Layout Mastery: Flexbox, Grid, and Container Queries** - HackerNews, October 2024
   Learn responsive design patterns that prevent overflow issues and work across all screen sizes.
   [Link to discussion]
```

## Tips and 最佳实践

- Run this analysis once a week to track your improvement trajectory over time
- Pick one improvement area at a time and focus on it for a few days before moving to the next
- Use the learning resources as a study guide; work through the recommended materials and practice applying the patterns
- Revisit this report after focusing on an area for a week to see how your work patterns change
- The learning resources are intentionally curated for your actual work, not generic topics, so they'll be highly relevant to what you're building

## How Accuracy and Quality Are Maintained

This skill:
- Analyzes your actual work patterns from timestamped chat history
- Generates evidence-based recommendations grounded in real projects
- Curates learning resources that directly address your identified gaps
- Focuses on actionable improvements, not vague feedback
- Provides specific time estimates based on complexity
- Prioritizes areas that will have the most impact on your development velocity
