import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RegistroMaletasRoutingModule } from './registro-maletas-routing.module';
import { MaletaComponent } from './components/maleta/maleta.component';

@NgModule({
  declarations: [
    MaletaComponent,

  ],
  imports: [
    CommonModule, 
    RegistroMaletasRoutingModule
  ],
})
export class RegistroMaletasModule {

}
