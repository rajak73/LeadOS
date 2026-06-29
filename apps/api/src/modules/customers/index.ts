import { Router } from 'express';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

export function buildCustomersModule(requirePermission: (permission: string) => any): Router {
  const service = new CustomerService();
  const controller = new CustomerController(service);
  const router = Router();

  // Route definitions
  // GET /customers
  router.get('/', requirePermission('contacts.read'), controller.listCustomers);
  // GET /customers/:id
  router.get('/:id', requirePermission('contacts.read'), controller.getCustomerProfile);

  return router;
}
