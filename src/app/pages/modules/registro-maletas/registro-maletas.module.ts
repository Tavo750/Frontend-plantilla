import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { RegistroMaletasRoutingModule } from './registro-maletas-routing.module';
import { MaletaComponent } from './components/maleta/maleta.component';
import { PrimeNgModule } from '../../../prime-ng/prime-ng.module';

@NgModule({
  declarations: [MaletaComponent],
  imports: [
    CommonModule,
    RegistroMaletasRoutingModule,
    PrimeNgModule
  ],
  providers: [MessageService]
})
export class RegistroMaletasModule { }
