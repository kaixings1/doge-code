/**
 * Singleton manager for cloud-provider authentication status (AWS Bedrock,
 * GCP Vertex). Communicates auth refresh state between auth utilities and
 * React components / SDK output. The SDK 'auth_status' message shape is
 * provider-agnostic, so a single manager serves all providers.
 *
 * Legacy name: originally AWS-only; now used by all cloud auth refresh flows.
 */
import { createSignal } from './signal.js';
export class AwsAuthStatusManager {
    static instance = null;
    status = {
        isAuthenticating: false,
        output: [],
    };
    changed = createSignal();
    static getInstance() {
        if (!AwsAuthStatusManager.instance) {
            AwsAuthStatusManager.instance = new AwsAuthStatusManager();
        }
        return AwsAuthStatusManager.instance;
    }
    getStatus() {
        return {
            ...this.status,
            output: [...this.status.output],
        };
    }
    startAuthentication() {
        this.status = {
            isAuthenticating: true,
            output: [],
        };
        this.changed.emit(this.getStatus());
    }
    addOutput(line) {
        this.status.output.push(line);
        this.changed.emit(this.getStatus());
    }
    setError(error) {
        this.status.error = error;
        this.changed.emit(this.getStatus());
    }
    endAuthentication(success) {
        if (success) {
            // Clear the status completely on success
            this.status = {
                isAuthenticating: false,
                output: [],
            };
        }
        else {
            // Keep the output visible on failure
            this.status.isAuthenticating = false;
        }
        this.changed.emit(this.getStatus());
    }
    subscribe = this.changed.subscribe;
    // Clean up for testing
    static reset() {
        if (AwsAuthStatusManager.instance) {
            AwsAuthStatusManager.instance.changed.clear();
            AwsAuthStatusManager.instance = null;
        }
    }
}
