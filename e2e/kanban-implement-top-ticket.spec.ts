import { test, expect } from '@playwright/test'

test('clicking "Implement top ticket" moves card to Active Work (headed-visible)', async ({
  page,
}) => {
  await page.goto('/e2e-kanban.html')

  const todoColumn = page.locator('[data-column-id="col-todo"]')
  await expect(todoColumn).toBeVisible()

  await expect(todoColumn.getByText('Test Ticket A')).toBeVisible()

  await todoColumn
    .getByRole('button', { name: 'Implement top ticket' })
    .click()

  const activeWork = page.getByLabel('Active Work')
  await expect(activeWork).toBeVisible()
  await expect(activeWork.getByText('Test Ticket A')).toBeVisible()

  await expect(todoColumn.getByText('Test Ticket A')).toHaveCount(0)
})

