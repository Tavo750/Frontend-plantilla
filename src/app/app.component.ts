import { Component } from '@angular/core';

/**
 * Componente raíz de la aplicación.
 * Principio SOLID (S): Solo renderiza el router-outlet principal.
 */
@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {}
