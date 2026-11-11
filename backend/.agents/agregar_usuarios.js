const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function inyectarDatosDemo() {
    try {
        console.log('⏳ Agregando usuarios y kits de demostración...');
        const passwordComun = await bcrypt.hash('123456', 10);

        // 1. Crear o actualizar a Adriana (Manager / Admin)
        const adriana = await prisma.usuario.upsert({
            where: { email: 'adriana@tellcenter.com' },
            update: {},
            create: {
                nombre: 'Adriana',
                email: 'adriana@tellcenter.com',
                password: passwordComun,
                cargo: 'Gerente Administrativa (Manager)',
                cuenta: 'Administración'
            }
        });

        // 2. Crear o actualizar a Velado (Remoto + Accesorios)
        const velado = await prisma.usuario.upsert({
            where: { email: 'velado@tellcenter.com' },
            update: {},
            create: {
                nombre: 'Velado',
                email: 'velado@tellcenter.com',
                password: passwordComun,
                cargo: 'Desarrollador / Soporte IT (Remoto)',
                cuenta: 'IT & Desarrollo'
            }
        });

        // 3. Crear o actualizar a Carlos Mendoza (Agente Presencial)
        const carlos = await prisma.usuario.upsert({
            where: { email: 'carlos.mendoza@tellcenter.com' },
            update: {},
            create: {
                nombre: 'Carlos Mendoza',
                email: 'carlos.mendoza@tellcenter.com',
                password: passwordComun,
                cargo: 'Agente de Atención al Cliente',
                cuenta: 'Customer Support'
            }
        });

        // Equipos para el Kit de Velado (Equipo Propio $0 + Headset + Monitor + Teclado)
        const equiposDemo = [
            {
                codigoInventario: 'TC-REM-0001',
                numeroSerie: 'SN-PROPIO-VELADO',
                categoria: 'Equipo Propio (Remoto - $0.00)',
                marcaModelo: 'PC Personal Custom (Ordenador Propio)',
                costoCompra: 0.00,
                comentarios: 'Equipo personal de Velado para trabajo remoto (Sin costo para Tellcenter)',
                estado: 'ASIGNADO',
                usuarioId: velado.id
            },
            {
                codigoInventario: 'TC-AUD-0021',
                numeroSerie: 'SN-JBR-8821',
                categoria: 'Headset / Audio',
                marcaModelo: 'Jabra Biz 2400 II USB',
                costoCompra: 85.00,
                comentarios: 'Headset corporativo con cancelación de ruido',
                estado: 'ASIGNADO',
                usuarioId: velado.id
            },
            {
                codigoInventario: 'TC-MON-0022',
                numeroSerie: 'SN-DELL-4410',
                categoria: 'Monitor',
                marcaModelo: 'Monitor Dell 24" IPS FHD',
                costoCompra: 165.00,
                comentarios: 'Monitor secundario asignado a modalidad remota',
                estado: 'ASIGNADO',
                usuarioId: velado.id
            },
            {
                codigoInventario: 'TC-PER-0023',
                numeroSerie: 'SN-LOG-1092',
                categoria: 'Periféricos (Teclado / Mouse / Cables)',
                marcaModelo: 'Combo Teclado y Mouse Logitech MK270',
                costoCompra: 32.00,
                comentarios: 'Kit inalámbrico asignado a Velado',
                estado: 'ASIGNADO',
                usuarioId: velado.id
            },
            // Equipos para Adriana (Manager)
            {
                codigoInventario: 'TC-LAP-0030',
                numeroSerie: 'SN-HP-99201',
                categoria: 'Laptop / Computadora',
                marcaModelo: 'HP ProBook 450 G9 Core i7',
                costoCompra: 950.00,
                comentarios: 'Laptop principal de Gerencia / Coordinación',
                estado: 'ASIGNADO',
                usuarioId: adriana.id
            },
            {
                codigoInventario: 'TC-UPS-0031',
                numeroSerie: 'SN-APC-5501',
                categoria: 'UPS / Respaldo de Energía',
                marcaModelo: 'UPS APC Back-UPS 1000VA',
                costoCompra: 140.00,
                comentarios: 'Respaldo eléctrico oficina gerencial',
                estado: 'ASIGNADO',
                usuarioId: adriana.id
            },
            // Equipos para Carlos Mendoza (Estación Completa)
            {
                codigoInventario: 'TC-KIT-0001',
                numeroSerie: 'SN-EST-0001',
                categoria: 'Estación / Kit Completo (CPU + Monitor + Periféricos)',
                marcaModelo: 'Estación Dell OptiPlex + Monitor 22" + Teclado/Mouse',
                costoCompra: 680.00,
                comentarios: 'Estación completa etiquetada bajo un solo código de inventario',
                estado: 'ASIGNADO',
                usuarioId: carlos.id
            },
            {
                codigoInventario: 'TC-UPS-0032',
                numeroSerie: 'SN-APC-5502',
                categoria: 'UPS / Respaldo de Energía',
                marcaModelo: 'UPS Forza 750VA',
                costoCompra: 65.00,
                comentarios: 'Protección eléctrica estación #1',
                estado: 'ASIGNADO',
                usuarioId: carlos.id
            }
        ];

        for (const eq of equiposDemo) {
            const existe = await prisma.equipo.findUnique({
                where: { codigoInventario: eq.codigoInventario }
            });

            if (!existe) {
                await prisma.equipo.create({
                    data: {
                        ...eq,
                        historial: {
                            create: [
                                { accion: 'REGISTRADO', detalle: 'Ingreso inicial al catálogo IT' },
                                { accion: 'ASIGNADO', detalle: `Asignado al kit del colaborador` }
                            ]
                        }
                    }
                });
            }
        }

        console.log('✅ ¡Usuarios (Adriana, Velado, Carlos) y sus Kits creados con éxito!');
    } catch (error) {
        console.error('❌ Error al inyectar datos:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inyectarDatosDemo();