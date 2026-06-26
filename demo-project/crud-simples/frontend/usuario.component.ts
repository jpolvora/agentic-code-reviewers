import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-usuario',
  template: `
    <div>
      <h3>Detalhes do Usuário</h3>
      <!-- Vulnerabilidade: Exibição insegura de HTML não sanitizado que pode causar XSS -->
      <div #nomeInseguroContainer></div>
      
      <button (click)="salvar()">Salvar</button>
    </div>
  `
})
export class UsuarioComponent implements OnInit {
  // MA CORREÇÃO: Uso de 'any' em tudo, desabilitando o type checking do TypeScript
  public usuario: any = {};
  public id: any;

  @ViewChild('nomeInseguroContainer', { static: true }) nomeContainer!: ElementRef;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // VULNERABILIDADE: Vazamento de memória (Memory Leak)!
    // Foi feito subscribe direto em Observable longo sem chamar unsubscribe no ngOnDestroy ou takeUntil/take(1)
    this.route.params.subscribe(params => {
      this.id = params['id'];
      this.carregarUsuario();
    });
  }

  carregarUsuario() {
    this.http.get('api/usuario/' + this.id).subscribe((res: any) => {
      this.usuario = res;
      
      // VULNERABILIDADE CRÍTICA: Injeção de HTML/XSS via innerHTML direto com dados vindos do backend sem usar DomSanitizer
      this.nomeContainer.nativeElement.innerHTML = "<b>Nome:</b> " + this.usuario.nome;
    });
  }

  salvar() {
    // MA CORREÇÃO: Uso de var em vez de let ou const
    var payload: any = {
      nome: this.usuario.nome,
      email: this.usuario.email
    };

    this.http.post('api/usuario', payload).subscribe(res => {
      alert("Salvo!");
    });
  }
}
