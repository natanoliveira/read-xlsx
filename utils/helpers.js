const { ConnectionStates } = require("mongoose");

const _trocaEspacos = async function (minhaString) {

    if (minhaString != undefined) {
        // Expressão regular para verificar dois espaços consecutivos
        const regex = /  /;

        // Verifica se a string contém dois espaços em branco consecutivos
        if (regex.test(minhaString)) {
            return minhaString.replace('  ', ' ');
        }
    }

    return minhaString;
};

module.exports = {
    trocaEspacos: _trocaEspacos,
}