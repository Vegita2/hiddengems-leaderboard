/**
 * Vendor imports for DataTables pages (index, matrix).
 */

// jQuery - needed for DataTables
import jquery from 'jquery';
window.jQuery = window.$ = jquery;

// DataTables (requires jQuery global to be set first)
import DataTable from 'datatables.net';

export { DataTable };
