import { DealerInfo } from '@/types/manufacturer';

export const defaultMarquisDealer: DealerInfo = {
  dealerName: 'Hibernation Stoves & Spas',
  dealerNumber: '101099',
  orderedBy: 'Jeremy Carlson',
  email: 'jeremy@hibernation.com',
  shippingAddress: '2122 Highway 49 Suite D, Angels Camp, CA (Appointment Required - 24 Hour Notice)',
  phone: '209-795-4339',
  lastName: '',
  orderDate: new Date().toISOString().split('T')[0],
  paymentMethod: 'EFT/ACH/Bank Wire/Prepay',
};

export const defaultSundanceDealer: DealerInfo = {
  dealerName: 'Hibernation Stoves & Spas',
  dealerNumber: '1805',
  orderedBy: 'Jeremy Carlson',
  email: 'jeremy@hibernation.com',
  shippingAddress: '2122 Highway 49 Suite D, Angels Camp, CA (Appointment Required - 24 Hour Notice)',
  phone: '209-795-4339',
  lastName: '',
  orderDate: new Date().toISOString().split('T')[0],
  paymentMethod: 'EFT/Prepay',
};

export const DEFAULT_MARQUIS_FREIGHT = 300;
export const DEFAULT_SUNDANCE_FREIGHT = 550;
