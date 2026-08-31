import { Event } from './event.js';
/**
 * Base class for all terminal events with DOM-style propagation.
 *
 * Extends Event so existing event types (ClickEvent, InputEvent,
 * TerminalFocusEvent) share a common ancestor and can migrate later.
 *
 * Mirrors the browser's Event API: target, currentTarget, eventPhase,
 * stopPropagation(), preventDefault(), timeStamp.
 */
export class TerminalEvent extends Event {
    constructor(type, init) {
        super();
        this._target = null;
        this._currentTarget = null;
        this._eventPhase = 'none';
        this._propagationStopped = false;
        this._defaultPrevented = false;
        this.type = type;
        this.timeStamp = performance.now();
        this.bubbles = init?.bubbles ?? true;
        this.cancelable = init?.cancelable ?? true;
    }
    get target() {
        return this._target;
    }
    get currentTarget() {
        return this._currentTarget;
    }
    get eventPhase() {
        return this._eventPhase;
    }
    get defaultPrevented() {
        return this._defaultPrevented;
    }
    stopPropagation() {
        this._propagationStopped = true;
    }
    stopImmediatePropagation() {
        super.stopImmediatePropagation();
        this._propagationStopped = true;
    }
    preventDefault() {
        if (this.cancelable) {
            this._defaultPrevented = true;
        }
    }
    // -- Internal setters used by the Dispatcher
    /** @internal */
    _setTarget(target) {
        this._target = target;
    }
    /** @internal */
    _setCurrentTarget(target) {
        this._currentTarget = target;
    }
    /** @internal */
    _setEventPhase(phase) {
        this._eventPhase = phase;
    }
    /** @internal */
    _isPropagationStopped() {
        return this._propagationStopped;
    }
    /** @internal */
    _isImmediatePropagationStopped() {
        return this.didStopImmediatePropagation();
    }
    /**
     * Hook for subclasses to do per-node setup before each handler fires.
     * Default is a no-op.
     */
    _prepareForTarget(_target) { }
}
