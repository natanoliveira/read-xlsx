// backend.js

const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const fs = require('fs');

const utils = require('./utils/helpers');
const constants = require('./utils/constants');

const app = express();
// const upload = multer({ dest: 'uploads/' });

//  ===============================================================================
// Configuração do Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Diretório onde os arquivos serão salvos
    },
    filename: function (req, file, cb) {
        // const cleanedFilename = file.originalname.replace(/[^\w\s.-]/gi, '_');
        const decodedFilename = decodeURIComponent(file.originalname);
        cb(null, Date.now() + '-' + decodedFilename); // Nome do arquivo
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 10 // Limite de tamanho do arquivo (10MB)
    },
    fileFilter: function (req, file, cb) {
        // Verifica se o tipo do arquivo é permitido
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos XLSX são permitidos.'));
        }
    }
});

//  ===============================================================================

const dotenv = require('dotenv');
dotenv.config();

const { ObjectId } = require('mongodb');

//  ===============================================================================

const mongo_db = process.env.MONGO_DB;
const mongo_user = encodeURIComponent(process.env.MONGO_USER);
const mongo_pass = encodeURIComponent(process.env.MONGO_PASS);
const mongo_cluster = process.env.MONGO_CLUSTER;
const dir_planilhas = process.env.DIR_PLANILHAS;
const mongo_uri = process.env.MONGO_URI;

//  ===============================================================================

const uri = `mongodb+srv://${mongo_user}:${mongo_pass}@${mongo_cluster}.mongodb.net/${mongo_db}?retryWrites=true&w=majority`;
mongoose.connect(uri, {});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Erro de conexão com o MongoDB:'));
db.once('open', () => {
    console.log('Conectado ao MongoDB com sucesso!');
});

//  ===============================================================================

// Defina o modelo do seu banco de dados MongoDB
const EscolaModelo = mongoose.model('escolas', {
    anoLetivo: { type: String, required: true },
    entidadeId: { type: String, required: true },
    entidadeNome: { type: String, required: true },
    dataImportacao: {
        type: Date,
        default: Date.now // Define o valor padrão para a data de inserção como a data atual
    },
    origem: { type: String },
    alunos: [{
        nome: { type: String },
        cpf: { type: String },
        dataNascimento: { type: String },
        idModalidade: { type: String },
        modalidade: { type: String },
        idCurso: { type: String },
        curso: { type: String },
        idEtapa: { type: String },
        etapa: { type: String },
        idTurno: { type: String },
        turno: { type: String },
        municipio: { type: String },
        idEntidade: { type: String },
        entidade: { type: String },
    }]

});

//  ===============================================================================

const hoje = new Date();
const anoAtual = hoje.getFullYear();

// Rota para upload do arquivo Excel
app.post('/upload', upload.single('excelFile'), async (req, res) => {

    const file = req.file;
    const ano = req.body.ano;

    // {
    //     fieldname: 'excelFile',
    //     originalname: '308-CETI DIDAÌ\x81CIO SILVA-OK.xlsx',
    //     encoding: '7bit',
    //     mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    //     destination: 'uploads/',
    //     filename: '1707334006422-308-CETI DIDAÌ\x81CIO SILVA-OK.xlsx',
    //     path: 'uploads/1707334006422-308-CETI DIDAÌ\x81CIO SILVA-OK.xlsx',
    //     size: 12530
    //   }

    if (!file) {
        return res.status(400).send({ message: 'Nenhum arquivo foi enviado.' });
    }

    // Trabalhando os dados do cabeçalho
    const [idEscola, nomeEscola, ok] = file.originalname.split('-');
    let documento = {};

    documento.anoLetivo = ano;
    documento.entidadeId = idEscola.trim();
    documento.entidadeNome = nomeEscola.trim();
    documento.origem = constants.SISTEMA_ORIGEM;
    documento.alunos = [];

    // Ler o arquivo Excel
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // console.log(sheet);
    // return;
    const data = xlsx.utils.sheet_to_json(sheet);

    // Coleção sem os alunos
    // console.log(documento);
    // return

    data.forEach(async itemData => {

        // nomes em caixa alta
        itemData.nome = itemData.nome.toUpperCase();

        // Uniformizando os itens de coleção
        if (itemData.Entidade) {
            itemData.entidade = itemData.Entidade;
            delete itemData.Entidade;
        }

        if (itemData.Municipio) {
            itemData.municipio = itemData.Municipio;
            delete itemData.Municipio;
        }

        if (itemData.Turno) {
            itemData.turno = itemData.Turno;
            delete itemData.Turno;
        }

        if (itemData.Etapa) {
            itemData.etapa = itemData.Etapa;
            delete itemData.Etapa;
        }

        // Verificando se o item que precisa ser string está numérico
        if (!isNaN(itemData.entidade)) {
            let numeroNoTexto = itemData.entidade;

            itemData.entidade = itemData.idEntidade;

            itemData.idEntidade = numeroNoTexto;
        }

        // console.log(itemData);

        // Reparando o nome da entidade (T.O.C.)
        let entidadeItem = await utils.trocaEspacos(itemData.entidade);

        // Renomenando o nome da escola pai
        documento.entidadeNome = entidadeItem;

        // Atribuindo à subcoleção também
        itemData.entidade = entidadeItem;

        // Incluindo na subcoleção
        documento.alunos.push(itemData);
    });

    // console.log(documento);
    // return;

    try {
        // Remover documento específico existente na coleção
        await EscolaModelo.deleteMany({ anoLetivo: ano, entidadeId: idEscola });

        // Adicionar os novos dados à base de dados MongoDB
        await EscolaModelo.create(documento);

        let dados = {
            arquivo: file.originalname,
            escola: nomeEscola,
            dataHora: new Date(),
            sistemaOrigem: constants.SISTEMA_ORIGEM
        }

        // Removendo da pasta upload o arquivo
        fs.unlinkSync(file.path);

        res.send({ message: 'Dados adicionados com sucesso ao MongoDB.', info: dados });
    } catch (error) {
        console.error('Erro ao adicionar dados ao MongoDB:', error);
        res.status(500).send({ message: 'Erro interno do servidor.' });
    }
});

// Inicie o servidor
const PORT = process.env.PORT_SERVER;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta http://localhost:${PORT}`);
});
