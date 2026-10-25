export interface TemplateData {
  id: string;
  nameKey: string;
  company: { name: string; description: string; industry: string; mission: string; size: string };
  departments: { id: string; name: string; parent_id: string | null; color: string; responsibility_zone: string }[];
  employees: {
    id: string; full_name: string; position: string; department_id: string | null;
    manager_id: string | null; project_manager_id: string | null;
    is_vacancy: boolean; duties: string; responsibility_zone: string;
  }[];
}

export const TEMPLATES: TemplateData[] = [
  {
    id: 'small_business',
    nameKey: 'templates.small_business',
    company: { name: 'Small Business', description: 'A compact team', industry: 'Services', mission: 'Serve customers well', size: '1-10' },
    departments: [
      { id: 'd1', name: 'Owner', parent_id: null, color: '#2563eb', responsibility_zone: 'Overall management' },
    ],
    employees: [
      { id: 'e1', full_name: 'Owner', position: 'Founder', department_id: 'd1', manager_id: null, project_manager_id: null, is_vacancy: false, duties: 'Run the business', responsibility_zone: 'Everything' },
    ],
  },
  {
    id: 'production',
    nameKey: 'templates.production',
    company: { name: 'Production Co', description: 'A manufacturing company', industry: 'Manufacturing', mission: 'Produce quality goods', size: '11-50' },
    departments: [
      { id: 'd1', name: 'Management', parent_id: null, color: '#2563eb', responsibility_zone: 'Strategy' },
      { id: 'd2', name: 'Production', parent_id: 'd1', color: '#16a34a', responsibility_zone: 'Manufacturing' },
      { id: 'd3', name: 'Quality', parent_id: 'd1', color: '#d97706', responsibility_zone: 'Quality control' },
      { id: 'd4', name: 'Logistics', parent_id: 'd1', color: '#0891b2', responsibility_zone: 'Shipping' },
    ],
    employees: [
      { id: 'e1', full_name: 'Director', position: 'CEO', department_id: 'd1', manager_id: null, project_manager_id: null, is_vacancy: false, duties: 'Lead the company', responsibility_zone: 'All' },
      { id: 'e2', full_name: 'Plant Manager', position: 'Plant Manager', department_id: 'd2', manager_id: 'e1', project_manager_id: null, is_vacancy: false, duties: 'Run production', responsibility_zone: 'Production floor' },
      { id: 'e3', full_name: 'QC Lead', position: 'QC Lead', department_id: 'd3', manager_id: 'e1', project_manager_id: null, is_vacancy: false, duties: 'Quality checks', responsibility_zone: 'Quality lab' },
      { id: 'e4', full_name: 'Logistics Lead', position: 'Logistics Lead', department_id: 'd4', manager_id: 'e1', project_manager_id: null, is_vacancy: false, duties: 'Shipping', responsibility_zone: 'Warehouse' },
      { id: 'e5', full_name: '', position: 'Machine Operator', department_id: 'd2', manager_id: 'e2', project_manager_id: null, is_vacancy: true, duties: '', responsibility_zone: '' },
    ],
  },
  {
    id: 'trading',
    nameKey: 'templates.trading',
    company: { name: 'Trading Co', description: 'A trading company', industry: 'Trading', mission: 'Connect buyers and sellers', size: '11-50' },
    departments: [
      { id: 'd1', name: 'Head Office', parent_id: null, color: '#2563eb', responsibility_zone: 'Management' },
      { id: 'd2', name: 'Sales', parent_id: 'd1', color: '#16a34a', responsibility_zone: 'Sales' },
      { id: 'd3', name: 'Purchasing', parent_id: 'd1', color: '#d97706', responsibility_zone: 'Buying' },
      { id: 'd4', name: 'Warehouse', parent_id: 'd1', color: '#0891b2', responsibility_zone: 'Storage' },
    ],
    employees: [
      { id: 'e1', full_name: 'CEO', position: 'CEO', department_id: 'd1', manager_id: null, project_manager_id: null, is_vacancy: false, duties: 'Lead', responsibility_zone: 'All' },
      { id: 'e2', full_name: 'Sales Manager', position: 'Sales Manager', department_id: 'd2', manager_id: 'e1', project_manager_id: null, is_vacancy: false, duties: 'Sales', responsibility_zone: 'Sales dept' },
      { id: 'e3', full_name: 'Buyer', position: 'Purchasing Manager', department_id: 'd3', manager_id: 'e1', project_manager_id: 'e2', is_vacancy: false, duties: 'Buy goods', responsibility_zone: 'Purchasing' },
      { id: 'e4', full_name: 'Warehouse Manager', position: 'Warehouse Manager', department_id: 'd4', manager_id: 'e1', project_manager_id: null, is_vacancy: false, duties: 'Store goods', responsibility_zone: 'Warehouse' },
    ],
  },
];
