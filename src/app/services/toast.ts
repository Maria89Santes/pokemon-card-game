import { Injectable, signal } from '@angular/core';

export interface Toast {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  id: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  toasts = signal<Toast[]>([]);

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    const id = Date.now();
    this.toasts.update(val => [...val, { message, type, id }]);
    
    // Auto-remove standard toasts after 4 seconds for readability
    setTimeout(() => {
      this.remove(id);
    }, 4000);
  }

  remove(id: number) {
    this.toasts.update(val => val.filter(t => t.id !== id));
  }
}
