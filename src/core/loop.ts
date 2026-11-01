/** Fréquence de la simulation : toute la logique de combat est exprimée en frames de 1/60 s. */
export const SIM_HZ = 60;
export const STEP_MS = 1000 / SIM_HZ;

/** Au-delà, on considère que l'onglet était en pause : on ne rattrape pas le retard. */
const MAX_FRAME_MS = 250;

/**
 * Accumulateur à pas fixe : convertit le temps réel écoulé en un nombre entier
 * de pas de simulation, plus un facteur d'interpolation pour le rendu.
 */
export class FixedStepAccumulator {
  private accumulated = 0;

  advance(elapsedMs: number): { steps: number; alpha: number } {
    this.accumulated += Math.min(Math.max(elapsedMs, 0), MAX_FRAME_MS);
    let steps = 0;
    while (this.accumulated >= STEP_MS) {
      this.accumulated -= STEP_MS;
      steps++;
    }
    return { steps, alpha: this.accumulated / STEP_MS };
  }
}
