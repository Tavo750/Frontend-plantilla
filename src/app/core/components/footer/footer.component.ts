import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as global from '../../../global';

/**
 * Componente Footer.
 * Principio SOLID (S): Solo muestra información del pie de página.
 */
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  anio: number = global.anio;
}
