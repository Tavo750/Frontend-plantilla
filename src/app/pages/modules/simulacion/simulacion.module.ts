import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { SimulacionRoutingModule } from './simulacion-routing.module';
import { SimulacionComponent } from './components/simulacion/simulacion.component';
import { PrimeNgModule } from '../../../prime-ng/prime-ng.module';

@NgModule({
  declarations: [SimulacionComponent],
  imports: [
    CommonModule,
    SimulacionRoutingModule,
    PrimeNgModule
  ],
  providers: [MessageService]
})
export class SimulacionModule {}
