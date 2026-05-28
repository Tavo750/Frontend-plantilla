import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { RegisterBody } from '../../interfaces/registerBody';

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

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router
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
      idAerolinea:     [null, [Validators.required, Validators.min(1)]]
    });
  }

  get nombre()          { return this.registerForm.get('nombre')!; }
  get apellidoPaterno() { return this.registerForm.get('apellidoPaterno')!; }
  get apellidoMaterno() { return this.registerForm.get('apellidoMaterno')!; }
  get correo()          { return this.registerForm.get('correo')!; }
  get contrasena()      { return this.registerForm.get('contrasena')!; }
  get puesto()          { return this.registerForm.get('puesto')!; }
  get idAerolinea()     { return this.registerForm.get('idAerolinea')!; }

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
        this.router.navigate(['/dashboard']);
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
