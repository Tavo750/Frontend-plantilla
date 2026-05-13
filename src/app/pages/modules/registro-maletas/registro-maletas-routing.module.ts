import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MaletaComponent } from './components/maleta/maleta.component';

const routes: Routes = [
  { path: '', component: MaletaComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RegistroMaletasRoutingModule {}
