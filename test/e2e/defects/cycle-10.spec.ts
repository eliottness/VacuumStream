import { expect, test } from "../support/fixtures"
import { defectTest } from "../support/ledger-test"

test.describe("cycle-10 defects", () => {
  test.use({ seed: {} })

  defectTest("D-cycle-10-1", async ({ controller, window }) => {
    const showcaseUrl = new URL(window.url())
    showcaseUrl.search = "?showcase=1"
    await window.goto(showcaseUrl.href)

    // Navigate to a VideoResumePrompt button in the showcase
    const maxAttempts = 300
    let currentFocusId = await controller.focusId()
    for (let i = 0; i < maxAttempts && !currentFocusId.startsWith("showcase-resume-"); i++) {
      await controller.press("ArrowDown")
      currentFocusId = await controller.focusId()
    }
    expect(currentFocusId).toMatch(/^showcase-resume-/)

    // The defect: focus is trapped in the VideoResumePrompt buttons because they
    // hardwire all directional links to prompt-local IDs, preventing escape via Up/Down.
    // The fixed behaviour: focus can leave the prompt via Up arrow to reach CategoryShelf below.
    // From VideoResumePrompt.tsx line 86, buttons have:
    //   data-focus-up={actions[index - 1]?.id ?? action.id}
    // which loops back to self when there's no previous action.
    // When moved to the top of the visible prompts, Up should escape.

    // Navigate up from a VideoResumePrompt button - should reach a control that is NOT part of showcase-resume-*
    // CategoryShelf controls come after the prompts and use different IDs (category-* or shelf-*)
    await controller.press("ArrowUp")
    const focusAfterUp = await controller.focusId()

    // The test asserts the FIXED behavior: focus CAN leave the prompt
    // It must fail today because the arrows are hardwired to loop within the prompt
    expect(focusAfterUp).not.toMatch(/^showcase-resume-/)
  })
})
