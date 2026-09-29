with open('D:/doge-code/tsc-errors.txt', 'r', encoding='utf-8') as f:
    for line in f:
        if 'template literal' in line or ('string' in line and 'not assignable to parameter' in line):
            print(line.strip()[:200])
