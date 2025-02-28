const mongoose = require('mongoose');

const ProductoSchema = new mongoose.Schema({
  nombre: {type: String, required: true},
  precio: {type: Number, required: true},
  imagenUrl: {type : String},
  descripcion: {type: String},
},{ timestamps: true });

const Producto = mongoose.model('Producto', ProductoSchema);

module.exports = Producto;