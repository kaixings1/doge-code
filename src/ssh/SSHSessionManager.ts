export class SSHSessionManager {
  connect() {}
  disconnect() {}
  sendMessage(_content: unknown) { return true }
  sendInterrupt() {}
  respondToPermissionRequest(_requestId: string, _result: unknown) {}
}
