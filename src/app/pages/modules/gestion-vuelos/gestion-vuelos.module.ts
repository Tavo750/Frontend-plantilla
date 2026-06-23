import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { GestionVuelosRoutingModule } from './gestion-vuelos-routing.module';
import { VueloComponent } from './components/vuelo/vuelo.component';
import { PrimeNgModule } from '../../../prime-ng/prime-ng.module';

@NgModule({
  declarations: [VueloComponent],
  imports: [
    CommonModule,
    GestionVuelosRoutingModule,
    PrimeNgModule
  ],
  providers: [MessageService]
})
export class GestionVuelosModule { }
