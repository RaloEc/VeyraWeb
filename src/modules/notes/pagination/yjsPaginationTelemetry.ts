import * as Y from 'yjs';

export interface YjsIsolationMetrics {
  updateEventCount: number;
  totalBytesEmitted: number;
  vectorUnchanged: boolean;
  historyTransactions: number;
}

/**
 * Monitor de desarrollo para verificar el aislamiento estricto de Yjs durante recálculos visuales.
 * Registra únicamente contadores de eventos y tamaños en bytes; nunca registra contenido de texto.
 */
export class YjsPaginationTelemetry {
  private doc: Y.Doc;
  private updateCount = 0;
  private bytesEmitted = 0;
  private initialVector: Uint8Array;
  private cleanupFn: (() => void) | null = null;

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.initialVector = Y.encodeStateVector(doc);

    const onUpdate = (update: Uint8Array) => {
      this.updateCount++;
      this.bytesEmitted += update.byteLength;
      console.warn(
        `[YJS-TELEMETRY] ALERTA: Mutación Yjs detectada durante operación (${update.byteLength} bytes)`
      );
    };

    this.doc.on('update', onUpdate);
    this.cleanupFn = () => {
      this.doc.off('update', onUpdate);
    };
  }

  public reset(): void {
    this.updateCount = 0;
    this.bytesEmitted = 0;
    this.initialVector = Y.encodeStateVector(this.doc);
  }

  public getMetrics(): YjsIsolationMetrics {
    const currentVector = Y.encodeStateVector(this.doc);
    let vectorUnchanged = this.initialVector.byteLength === currentVector.byteLength;
    if (vectorUnchanged) {
      for (let i = 0; i < this.initialVector.length; i++) {
        if (this.initialVector[i] !== currentVector[i]) {
          vectorUnchanged = false;
          break;
        }
      }
    }

    return {
      updateEventCount: this.updateCount,
      totalBytesEmitted: this.bytesEmitted,
      vectorUnchanged,
      historyTransactions: 0,
    };
  }

  public destroy(): void {
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }
}
