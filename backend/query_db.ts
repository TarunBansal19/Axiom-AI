import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const notebooks = await prisma.notebook.findMany()
  console.log("Notebooks:", notebooks)
}
main()
