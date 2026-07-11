export function createMovedToPluginCommand({ name, description, progressMessage, pluginName, pluginCommand, getPromptWhileMarketplaceIsPrivate, }) {
    return {
        type: 'prompt',
        name,
        description,
        progressMessage,
        contentLength: 0, // Dynamic content
        userFacingName() {
            return name;
        },
        source: 'builtin',
        async getPromptForCommand(args, context) {
            if (process.env.USER_TYPE === 'ant') {
                return [
                    {
                        type: 'text',
                        text: `This command has been moved to a plugin. Tell the user:

1. To install the plugin, run:
   claude plugin install ${pluginName}@claude-code-marketplace

2. After installation, use /${pluginName}:${pluginCommand} to run this command

3. For more information, see: https://github.com/anthropics/claude-code-marketplace/blob/main/${pluginName}/README.md

Do not attempt to run the command. Simply inform the user about the plugin installation.`,
                    },
                ];
            }
            return getPromptWhileMarketplaceIsPrivate(args, context);
        },
    };
}
