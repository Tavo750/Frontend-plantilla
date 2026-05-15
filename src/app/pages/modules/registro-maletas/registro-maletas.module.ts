import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { RegistroMaletasRoutingModule } from './registro-maletas-routing.module';
import { MaletaComponent } from './components/maleta/maleta.component';
import { PrimeNgModule } from '../../../prime-ng/prime-ng.module';

@NgModule({
  declarations: [
    MaletaComponent,

  ],
  imports: [
    CommonModule, 
    RegistroMaletasRoutingModule,
    FormsModule,
    PrimeNgModule
  ],
})
export class RegistroMaletasModule {

}
