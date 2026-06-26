/**
 * CURSOR-REVIEWER-SEED — REMOVER ANTES DO PUSH (ver scripts/cursor-reviewer/SEED-ISSUES.md).
 * Componente temporário; não registrar em rotas nem módulos.
 */
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cursor-reviewer-seed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cursor-reviewer-seed.component.html',
})
export class CursorReviewerSeedComponent {
  // SEED-F1: conteúdo dinâmico exposto ao template via innerHTML
  readonly userGeneratedHtml = '<img src=x onerror=alert(1)>';

  // SEED-F3: download PDF sem validar payload base64 antes de atob()
  downloadRelatorioPdf(base64Payload: string, filename: string): void {
    const binary = atob(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // SEED-F2: ação destrutiva acionada pelo template sem *abpPermission
  excluirTodosRegistros(): void {
    console.warn('SEED-F2: exclusão em massa sem verificação de permissão');
  }
}
