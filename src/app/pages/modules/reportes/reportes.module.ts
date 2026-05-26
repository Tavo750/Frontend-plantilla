import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { ReportesRoutingModule } from './reportes-routing.module';
import { ReportesComponent } from './components/reportes/reportes.component';
import { PrimeNgModule } from '../../../prime-ng/prime-ng.module';

@NgModule({
  declarations: [ReportesComponent],
  imports: [
    CommonModule,
    ReportesRoutingModule,
    PrimeNgModule
  ],
  providers: [MessageService]
})
export class ReportesModule {}
