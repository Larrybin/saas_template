const { EventEmitter } = require('events');

/**
 * Minimal stub for `thread-stream` to keep pino transports working in
 * environments where worker threads and the original implementation
 * are problematic for the bundler (e.g. Turbopack).
 *
 * This implementation is intentionally simple:
 * - Emits a `ready` event on next tick after construction.
 * - Exposes a writable-style `write()` that forwards to stdout (best-effort).
 * - Implements `flush`, `flushSync`, `end`, `ref`, `unref`, and `closed`
 *   so pino's transport lifecycle hooks continue to function.
 */
class ThreadStreamStub extends EventEmitter {
  constructor(opts) {
    super();

    this._closed = false;
    this._sync = !!opts?.sync;

    // Behave similarly to real thread-stream, which emits `ready`
    // asynchronously once the worker is initialized.
    process.nextTick(() => {
      if (this._closed) return;
      this.emit('ready');
    });
  }

  write(chunk) {
    try {
      if (typeof chunk === 'string') {
        process.stdout.write(chunk);
      } else if (chunk !== undefined && chunk !== null) {
        process.stdout.write(JSON.stringify(chunk));
      }
    } catch {
      // Ignore logging errors in the stub.
    }
    return true;
  }

  flush(cb) {
    if (typeof cb === 'function') {
      cb(null);
    }
  }

  flushSync() {
    // Synchronous no-op for compatibility.
  }

  end() {
    if (this._closed) return;
    this._closed = true;
    this.emit('close');
  }

  ref() {
    // No-op: there is no underlying worker to ref.
  }

  unref() {
    // No-op: there is no underlying worker to unref.
  }

  get closed() {
    return this._closed;
  }
}

module.exports = ThreadStreamStub;
