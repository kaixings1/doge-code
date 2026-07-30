try {
  const mod = await import('./src/commands/clear/conversation.js')
  console.log('SUCCESS: conversation.js resolved')
  console.log('Exports:', Object.keys(mod))
} catch (e) {
  console.error('FAIL:', e.message)
}
