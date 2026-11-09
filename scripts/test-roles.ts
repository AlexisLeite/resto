import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "../src/lib/database/client";
import { hashPassword } from "../src/lib/auth/password";
async function main() {
 const db=createDatabaseClient();const browser=await chromium.launch();
 const baseURL=process.env.APP_URL!;const id=randomUUID().slice(0,8);const password=randomUUID();
 const restaurant=await db.restaurant.create({data:{name:"Prueba de roles",slug:`roles-${id}`}});const restaurantId=restaurant.id;
 try {
  const passwordHash=await hashPassword(password);
  await db.user.create({data:{restaurantId,username:`multi-${id}`,name:"Persona multirrol",role:"ADMIN",roles:["ADMIN","WAITER","KITCHEN","CASHIER"],passwordHash}});
  const single=await db.user.create({data:{restaurantId,username:`single-${id}`,name:"Mozo",role:"WAITER",roles:["WAITER"],passwordHash}});
  const page=await browser.newPage({baseURL,viewport:{width:390,height:844}});
  await page.goto('/login');await page.getByLabel('Usuario',{exact:true}).fill(`multi-${id}`);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.waitForURL('**/dashboard');
  const combo=page.getByRole('combobox',{name:'Rol activo'});await expect(combo).toHaveJSProperty('tagName','SELECT');await expect(combo.locator('option')).toHaveCount(4);
  await combo.selectOption('WAITER');await expect(page.getByRole('main',{name:'El salón',exact:true})).toBeVisible();
  let state=await (await page.request.get('/api/state')).json();expect(state.user.role).toBe('WAITER');expect(state.users).toEqual([]);expect(state.shifts).toEqual([]);expect(state.report).toBeNull();expect(JSON.stringify(state)).not.toContain('sessionHash');
  await page.reload();await expect(combo).toHaveValue('WAITER');
  const post=(body:object,extra={})=>page.request.post('/api/commands',{headers:{Origin:baseURL,...extra},data:body});
  expect((await post({type:'shift.open',openingCash:'0'})).status()).toBe(403);
  expect((await post({type:'category.save',name:'Escalada'})).status()).toBe(403);
  if (!(await page.locator('.desktop-navigation').isVisible())) await page.getByRole('button',{name:'Menú de funcionalidades'}).click();await expect(page.getByRole('navigation').getByRole('button',{name:'Salón',exact:true})).toHaveCount(0);await expect(page.getByRole('navigation').getByRole('button',{name:'Caja',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await combo.selectOption('KITCHEN');await expect(page.getByRole('main',{name:'Cocina y barra',exact:true})).toBeVisible();expect((await post({type:'shift.open',openingCash:'0'})).status()).toBe(403);
  await combo.selectOption('CASHIER');await expect(page.getByRole('main',{name:'Caja',exact:true})).toBeVisible();expect((await post({type:'shift.open',openingCash:'0'},{'X-Resto-Role':'WAITER'})).status()).toBe(409);
  await combo.selectOption('ADMIN');await expect(page.getByRole('main',{name:'Resumen',exact:true})).toBeVisible();state=await (await page.request.get('/api/state')).json();expect(state.users.length).toBe(2);
  const one=await browser.newPage({baseURL,viewport:{width:390,height:844}});await one.goto('/login');await one.getByLabel('Usuario',{exact:true}).fill(single.username);await one.getByLabel('Contraseña',{exact:true}).fill(password);await one.getByRole('button',{name:'Ingresar',exact:true}).click();await one.waitForURL('**/dashboard');await expect(one.getByRole('combobox',{name:'Rol activo'})).toHaveCount(0);
  expect((await one.request.post('/api/auth/role',{headers:{Origin:baseURL},data:{role:'ADMIN'}})).status()).toBe(403);
  expect((await one.request.post('/api/auth/role',{headers:{Origin:'https://otro.example'},data:{role:'WAITER'}})).status()).toBe(403);
  expect((await one.request.post('/api/auth/role',{headers:{Origin:baseURL},data:{role:'OWNER'}})).status()).toBe(400);
  // La revocación de un rol invalida la sesión que lo estaba usando.
  await combo.selectOption('WAITER');await expect(page.getByRole('main',{name:'El salón',exact:true})).toBeVisible();await db.user.update({where:{username:`multi-${id}`},data:{roles:['ADMIN']}});expect((await page.request.get('/api/state')).status()).toBe(401);
  console.log('Roles OK: select nativo, persistencia, menú por rol, permisos efectivos, rol único sin combo, CSRF, rol inválido, revocación y protección ante otra pestaña.');
 } finally {await browser.close();await db.auditEvent.deleteMany({where:{restaurantId}});await db.user.deleteMany({where:{restaurantId}});await db.restaurant.delete({where:{id:restaurantId}});await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
