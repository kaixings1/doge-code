export class Event {
    constructor() {
        this._didStopImmediatePropagation = false;
    }
    didStopImmediatePropagation() {
        return this._didStopImmediatePropagation;
    }
    stopImmediatePropagation() {
        this._didStopImmediatePropagation = true;
    }
}
