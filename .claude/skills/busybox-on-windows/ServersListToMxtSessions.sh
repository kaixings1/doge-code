#!/bin/bash.exe

[ -e "/tmp/$$.tmp" ] && rm -f "/tmp/$$.tmp"
MobaBox.exe MobaSendMsg MobaXterm "-selectfile|Please select your list of servers|$$.tmp"

if [ -e "/tmp/$$.tmp" ]; then
  MyFile="`head -1 "/tmp/$$.tmp"`"
  rm -f "/tmp/$$.tmp"

  if [ -e "$MyFile" ]; then
    MyServerList="`cygpath -u "$MyFile"`"
    echo
    echo "Using server list $MyServerList..."
    echo
  
    TmpFile="$MyServerList.mxtsessions"
    touch "$TmpFile"
    if [ ! -e "$TmpFile" ]; then
      TmpFile="/home/mobaxterm/ImportedSessions.mxtsessions"
    fi
  
    echo "[Bookmarks]" > "$TmpFile"
    echo "SubRep=Imported" >> "$TmpFile"
    echo "ImgNum=41" >> "$TmpFile"
  
    cat "$MyServerList" | dos2unix | \
    (
      while read computer; do
        echo "Scanning host $computer, please wait..."
        if nc -w 2 -z $computer 22 >/dev/null 2>/dev/null; then
          echo "Adding SSH session for $computer"
          echo "$computer (SSH)= #109#0%$computer%22%%%-1%-1%%%22%%0%-1" >> "$TmpFile"
        fi
        if nc -w 2 -z $computer 3389 >/dev/null 2>/dev/null; then
          echo "Adding RDP session for $computer"
          echo "$computer (RDP)= #91#4%$computer%3389%%0%-1%-1%-1%-1%0%0%-1%%%22%%-1%0%%-1%%-1%-1%0" >> "$TmpFile"
        fi
        if nc -w 2 -z $computer 23 >/dev/null 2>/dev/null; then
          echo "Adding TELNET session for $computer"
          echo "$computer (Telnet)= #98#1%$computer%23%%%0%%22%%%0" >> "$TmpFile"
        fi
        echo
      done
    )
    
    echo
    echo
    echo "Your sessions have been saved to file `cygpath -w -a "$TmpFile"`"
    echo
    echo "Please right-click on your \"Saved sessions\" tree in MobaXterm,"
    echo "choose \"Import sessions from file\" and browse to this file"
    echo "in order to import your newly created sessions."
    echo
    echo
  fi
fi

