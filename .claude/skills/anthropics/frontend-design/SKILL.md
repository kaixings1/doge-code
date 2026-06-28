---
name: 前端设计
description: "在构建新 UI 或重塑现有界面时，提供独特且有意图的视觉设计指导。帮助确定美学方向、字体排版，并避免使用模板化的默认设计。当你需要创建有辨识度的前端界面设计时使用此技能。"
license: Complete terms in LICENSE.txt
---

# 前端设计

将此任务视为一家小型工作室的首席设计师，该工作室的每位客户都拥有独特的视觉标识，绝不会被误认为他人的作品。此客户已拒绝过那些感觉像模板的设计提案，他们为独特的视角付费——请就调色板、字体排版和版式做出有意识、有主见的选择，针对此简报量身定制，并提出一个你可以证明合理且真正有创意的美学风险。

## 以主题为根基

如果简报没有明确产品或主题是什么，请在开始设计之前自行确定：指定一个具体的主题、目标受众和页面的核心功能，并说明你的选择。如果你记忆中有什么关于用户的偏好、他们正在构建什么的信息，或者你之前的设计，就将其作为参考。主题自身的世界、它的材料、工具、文物和术语，就是独特选择的来源。始终使用简报的真实内容和主题进行设计。

## 设计原则

对于网页设计而言，主角是主题。从主题世界中最具代表性的事物开始，以最合适的形式呈现：一个标题、一张图片、一个动画、一个实时演示、一个互动瞬间。要有意识地选择：一个带有小标签的大数字、支持性数据和渐变强调色，是模板式的答案，只有在它真正是最佳选项时才使用。

字体排版承载着页面的个性。将展示字体和正文字体进行有意的搭配，而不是使用你在其他任何项目中都会选择的标准字体组合，并设定清晰的字体大小层级，使用精细的权重、宽度和间距。使字体呈现本身成为设计中令人难忘的一部分，而不是内容的被动载体。

结构即信息。结构元素、编号、眉毛标签、分隔线、标签，应该编码关于内容的真实信息，而不是装饰它。许多通用设计使用编号标记（01/02/03），但这只有在内容确实是一个序列时才合适——比如一个真实的过程或一个 sequentially timeline，其中顺序包含读者需要的信息。在采用编号标记之类的选择之前，先质疑它们是否真的有意义。

有意识地利用动态效果。思考动画在何处以及是否能为主题服务：页面加载序列、滚动触发揭示、悬停微交互、氛围背景。一个编排好的瞬间通常比散落的效果更有冲击力；选择符合方向需求的方式。然而，有时少即是多，过多的动画会给人一种设计是 AI 生成的感觉。

让复杂度与愿景相匹配。极繁主义方向需要复杂的执行；极简方向需要在间距、字体和细节上的精准。优雅在于将选择的愿景执行到位。

仔细考虑书面内容。通常设计简报可能不包含真实内容，这就需要你自己构思文案。文案能让一个设计感觉同样模板化。如需更多指导，请参阅下方的写作部分。

## 流程：头脑风暴、探索、规划、审查、构建、再次审查

For calibration: AI-generated design right now clusters around three looks: (1) a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta accent; (2) a near-black background with a single bright acid-green or vermilion accent; (3) a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns. All three are legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly — the brief's own words always win, including when it asks for one of these looks. Where it leaves an axis free, don't spend that freedom on one of these defaults. Just like a human designer who's hired, there's often a careful balance between doing what you're good at and taking each project as a chance to experiment and learn.

Work in two passes. First, brainstorm a short design plan based on the human's design brief: create a compact token system with color, type, layout, and signature. Color: describe the palette as 4–6 named hex values. Type: the typefaces for 2+ roles (a characterful display face that's used with restraint, a complementary body face, and a utility face for captions or data if needed). Layout: a layout concept, using one-sentence prose descriptions and ASCII wireframes to ideate and compare. Signature: the single unique element this page will be remembered by that embodies the brief in an appropriate way.

Then review that plan against the brief before building: if any part of it reads like the generic default you would produce for any similar page (work through a similar prompt to see if you arrive somewhere similar) rather than a choice made for this specific brief — revise that part, say what you changed and why. Only after you've confirmed the relative uniqueness of your design plan should you start to write the code, following the revised plan exactly and deriving every color and type decision from it.

When writing the code, be careful of structuring your CSS selector specificities. It's easy to generate CSS classes that cancel each other out (especially with a type-based selector like .section and a element-based selector like .cta). This can happen often with paddings/margins between sections.

Try to do a lot of this planning and iteration in your thinking, and only show ideas to the user when you have higher confidence it'll delight them.

## Restraint and self-critique

Spend your boldness in one place. Let the signature element be the one memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Not taking a risk can be a risk itself! Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected. Critique your own work as you build, taking screenshots if your environment supports it – a picture is worth 1000 tokens. Consider Chanel's advice: before leaving the house, take a look in the mirror and remove one accessory. Human creators have memory and always try to do something new, so if you have a space to quickly jot down notes about what you've tried, it can help you in future passes.

## More on writing in design

Words appear in a design for one reason: to make it easier to understand, and therefore easier to use. They are design material, not decoration. Bring the same intentionality to copy that you would bring to spacing and color. Before writing anything, ask what the design needs to say, and how it can best be said to help the person navigate the experience.

Write from the end user's side of the screen. Name things by what people control and recognize, never by how the system is built. A person manages notifications, not webhook config. Describe what something does in plain terms rather than selling it. Being specific is always better than being clever.

Use active voice as default. A control should say exactly what happens when it's used: "Save changes," not "Submit." An action keeps the same name through the whole flow, so the button that says "Publish" produces a toast that says "Published." The vocabulary of an interface is the signposting for someone navigating the product. Cohesion and consistency are how people learn their way around.

Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors don't apologize, and they are never vague about what happened. An empty screen is an invitation to act.

Keep the register conversational and tuned: plain verbs, sentence case, no filler, with tone matched to the brand and the audience. Let each element do exactly one job. A label labels, an example demonstrates, and nothing quietly does double duty.
