// ���������ַ��������ɴ�ӡ���ݣ������Ƴ���Ϊ 20 �ַ�
const sanitizeForDisplay = (text) => {
    return text
        .replace(/[\r\n\t\v\f]/g, ' ') // ���ֿհ��ַ�ת�ո�
        .replace(/\x1b\[[0-9;]*m/g, '') // �Ƴ� ANSI ת������
        .replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, '') // ���� ASCII �ɴ�ӡ�ַ�������
        .slice(-50); // ȡ��� 50 �ַ�
};
let tokenBuffer = '';
export const appendTokenText = (delta) => {
    tokenBuffer += delta;
    tokenBuffer = sanitizeForDisplay(tokenBuffer);
};
export const getTokenPreview = () => {
    return tokenBuffer;
};
//# sourceMappingURL=lastTokenText.js.map