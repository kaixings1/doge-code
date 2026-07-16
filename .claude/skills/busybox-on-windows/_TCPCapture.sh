TPUT(){ echo -en "\e[${1};${2}H";}
CLS() { echo -en "\e[0m\ec";}
M(){ TPUT $[$1+4] $[(72-$WI)/2+3];itn=$1;itn=$[itn+1];printf " %-*s " $WI "${IT[itn]}";}
MyMenu() {
LM=$#
LM=$[LM-2]
IT=( "$@" )
WI=0
for ((i=1;i<=$#;i++)); do WI=$(( ${#IT[i]} > $WI ? ${#IT[i]} : $WI )); done
i=0
CLS
echo -e "\n  \e[1;32m\e(0lqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk\e(B"
for f in `seq 1 $[LM+4]`;do echo -e "  \e(0x\e(B                                                                        \e(0x\e(B";done
TPUT 2 6
echo -e " $1 "
TPUT $[LM+6] 1
echo -e "  \e(0mqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqj\e(B\e[0m"
for f in `seq 0 $LM`;do M $f;done
while true; do
  echo -en "\e[0m"
  for f in `seq 0 $LM`;do M $f;done
  echo -en "\e[0m\e[48;2;80;100;120m"
  M $i
  TPUT 1000 1000
  if [ "$SHELL" = "/bin/zsh.exe" ]; then
    key2="";read -s -k1 key1;read -t 0.02 -s -k2 key2;key="$key1$key2"
  else
    read -s -n3 key 2>/dev/null >&2
  fi
  if [ "$key" = "`echo -en "\e"`[A" ];then ((i--));elif [ "$key" = "`echo -en "\e"`[B" ];then ((i++));else CLS;return $i;fi
  [ $i -lt 0 ] && i=$LM
  [ $i -gt $LM ] && i=0
done
}

unset INTERFS
ls "/bin/TCPCapture.exe" >/dev/null 2>/dev/null
ls "/bin/MobaBox.exe" >/dev/null 2>/dev/null
[ -e "/bin/TCPCapture.exe" ] && IFCONF="`TCPCapture --ifconfig | dos2unix`" || IFCONF="`MobaBox ifconfig | dos2unix`"
while read ligne; do
  INTERFNAME="`echo "$IFCONF" | grep -B2 "inet addr:${ligne##* }" | head -1`"
  INTERFNAME="${INTERFNAME:0:48}"
  INTERFS+=("$INTERFNAME (${ligne##* })")
done < <([ -e "/bin/TCPCapture.exe" ] && TCPCapture --listinterfaces | dos2unix || MobaBox TCPCapture --listinterfaces | dos2unix)
MyMenu "Choose network interface" "${INTERFS[@]}"
MyInterface="$?"
MyMenu "Print data content?" "Display RAW captured data" "Do not display RAW captured data"
MyRawData="$?"
[ "$MyRawData" = "0" ] && MyRawData="--showdata yes" || MyRawData="--showdata no"
[ -e "/bin/TCPCapture.exe" ] && TCPCapture --interface $MyInterface $MyRawData || MobaBox TCPCapture --interface $MyInterface $MyRawData
