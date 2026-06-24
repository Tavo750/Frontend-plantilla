import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Login } from './components/login/login.component';
import { CrearUsuario } from './components/crear-usuario/crear-usuario.component';

const routes: Routes = [
  { path: 'login',   component: Login },
  { path: 'registro', component: CrearUsuario },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AuthRoutingModule {}
