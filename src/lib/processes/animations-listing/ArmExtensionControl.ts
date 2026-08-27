import { UI } from '../../UI.ts'
import { Utility } from '../../Utilities.ts'

/**
 * ArmExtensionControl - shared controller for the "Expand / Contract Arms" UI.
 *
 * The markup is injected by DOMUtilities.populate_arm_extension_controls(), and both
 * the create workflow (StepAnimationsListing) and the retarget workflow
 * (RetargetAnimationListing) drive the same instance.
 *
 * This is a singleton on purpose. The controls live in static page markup, but the
 * retarget listing step is re-created every time the user clicks "Continue". Binding
 * the listeners once here and only swapping the change callback avoids stacking up
 * duplicate listeners on those round trips.
 */
export class ArmExtensionControl {
  private static instance: ArmExtensionControl | null = null

  private readonly ui: UI

  /** The amount to raise the arms, as a percentage. */
  private arm_extension_amount: number = 0.0

  private on_change: ((value: number) => void) | null = null

  private has_added_event_listeners: boolean = false

  private constructor () {
    this.ui = UI.getInstance()
  }

  public static getInstance (): ArmExtensionControl {
    if (ArmExtensionControl.instance === null) {
      ArmExtensionControl.instance = new ArmExtensionControl()
    }
    return ArmExtensionControl.instance
  }

  /**
   * Point the control at the workflow step that should react to changes.
   * Safe to call multiple times: listeners are only added once.
   */
  public initialize (on_change: (value: number) => void): void {
    this.on_change = on_change

    if (!this.has_added_event_listeners) {
      this.add_event_listeners()
      this.has_added_event_listeners = true
    }
  }

  public value (): number {
    return this.arm_extension_amount
  }

  /**
   * Return the value and both inputs to zero without notifying the current listener.
   * Needed because the markup is static and survives leaving/re-entering a step.
   */
  public reset (): void {
    this.arm_extension_amount = 0.0
    this.update_input_elements(0.0)
  }

  public set_visible (visible: boolean): void {
    if (this.ui.dom_arm_extension_options != null) {
      this.ui.dom_arm_extension_options.style.display = visible ? 'block' : 'none'
    }

    // let the animations listing reserve vertical space only when the controls are shown
    const animations_listing = document.getElementById('animations-listing')
    if (animations_listing !== null) {
      animations_listing.classList.toggle('has-arm-extension', visible)
    }
  }

  private update_input_elements (new_value: number): void {
    if (this.ui.dom_extend_arm_numeric_input !== null) {
      this.ui.dom_extend_arm_numeric_input.value = new_value.toString()
    }
    if (this.ui.dom_extend_arm_range_input !== null) {
      this.ui.dom_extend_arm_range_input.value = new_value.toString()
    }
  }

  // three different things might update this value: numeric input, range input, or reset button
  private update_value (new_value: number): void {
    this.arm_extension_amount = new_value
    this.on_change?.(new_value)
  }

  private add_event_listeners (): void {
    // reset A-Pose arm extension button
    this.ui.dom_reset_arm_extension_button?.addEventListener('click', () => {
      const extend_arm_value: number = 0 // reset to zero
      this.update_input_elements(extend_arm_value)
      this.update_value(extend_arm_value)
    })

    // A-Pose arm extension event listener
    this.ui.dom_extend_arm_numeric_input?.addEventListener('input', () => {
      const extend_arm_value: number = Utility.parse_input_number(this.ui.dom_extend_arm_numeric_input?.value)
      if (this.ui.dom_extend_arm_range_input !== null) {
        this.ui.dom_extend_arm_range_input.value = extend_arm_value.toString()
      }
      this.update_value(extend_arm_value)
    })

    this.ui.dom_extend_arm_range_input?.addEventListener('input', () => {
      const extend_arm_value: number = Utility.parse_input_number(this.ui.dom_extend_arm_range_input?.value)
      if (this.ui.dom_extend_arm_numeric_input !== null) {
        this.ui.dom_extend_arm_numeric_input.value = extend_arm_value.toString()
      }
      this.update_value(extend_arm_value)
    })
  }
}
