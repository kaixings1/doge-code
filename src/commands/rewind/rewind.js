export async function call(_args, context) {
    if (context.openMessageSelector) {
        context.openMessageSelector();
    }
    // Return a skip message to not append any messages.
    return { type: 'skip' };
}
