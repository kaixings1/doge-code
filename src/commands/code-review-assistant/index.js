const code_review_assistant = {
    type: 'local',
    name: 'code-review-assistant',
    description: '开发者工具 - code-review-assistant',
    load: () => import('./code_review_assistant.js'),
};
export default code_review_assistant;
