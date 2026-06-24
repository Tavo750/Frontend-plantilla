import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { RegisterBody } from '../../interfaces/registerBody';
import { AerolineaService, Aerolinea } from '../../../../../core/services/aerolinea.service';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';

@Component({
  selector: 'app-crear-usuario',
  standalone: false,
  templateUrl: './crear-usuario.component.html',
  styleUrl: './crear-usuario.component.css',
})
export class CrearUsuario implements OnInit {
  registerForm!: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;
  aerolineas: Aerolinea[] = [];
  loadingAerolineas = false;
  aeropuertos: Aeropuerto[] = [];
  loadingAeropuertos = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly aerolineaService: AerolineaService,
    private readonly aeropuertoService: AeropuertoService
  ) {}

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      nombre:          ['', [Validators.required, Validators.minLength(2)]],
      apellidoPaterno: ['', [Validators.required, Validators.minLength(2)]],
      apellidoMaterno: ['', [Validators.required, Validators.minLength(2)]],
      correo:          ['', [Validators.required, Validators.email]],
      contrasena:      ['', [Validators.required, Validators.minLength(6)]],
      puesto:          ['', [Validators.required]],
      fotoUrl:         [''],
      idAerolinea:     [null, [Validators.required]],
      idAeropuerto:    [null, [Validators.required]]
    });

    this.cargarAerolineas();
    this.cargarAeropuertos();
  }

  cargarAerolineas(): void {
    this.loadingAerolineas = true;
    this.aerolineaService.listarAerolineas().subscribe({
      next: (res) => {
        this.aerolineas = res.data ?? [];
        this.loadingAerolineas = false;
      },
      error: () => {
        this.loadingAerolineas = false;
      }
    });
  }

  cargarAeropuertos(): void {
    this.loadingAeropuertos = true;
    this.aeropuertoService.listarAeropuertos().subscribe({
      next: (res) => {
        this.aeropuertos = res.data ?? [];
        this.loadingAeropuertos = false;
      },
      error: () => {
        this.loadingAeropuertos = false;
      }
    });
  }

  get nombre()          { return this.registerForm.get('nombre')!; }
  get apellidoPaterno() { return this.registerForm.get('apellidoPaterno')!; }
  get apellidoMaterno() { return this.registerForm.get('apellidoMaterno')!; }
  get correo()          { return this.registerForm.get('correo')!; }
  get contrasena()      { return this.registerForm.get('contrasena')!; }
  get puesto()          { return this.registerForm.get('puesto')!; }
  get idAerolinea()     { return this.registerForm.get('idAerolinea')!; }
  get idAeropuerto()    { return this.registerForm.get('idAeropuerto')!; }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const body: RegisterBody = this.registerForm.value;

    this.authService.register(body).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/auth/login']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message ?? 'Error al registrar el usuario. Intenta de nuevo.';
      }
    });
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
