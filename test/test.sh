#!/bin/bash

tests_dir=$(dirname $0)
base_dir="$tests_dir/.."

pushd $base_dir > /dev/null

for file in $(find ./test -name "*.oj" -depth 1) ; do
    intermediate_file=$(mktemp -t oj)
    output_file=$(mktemp -t oj)

    node ./bin/ojc --output "$intermediate_file" $file
    if [ $? -ne 0 ]; then
        echo "$file failed to compile"
        exit $?
    fi

    echo $intermediate_file

    cat ./src/runtime.js "$intermediate_file" > "$output_file"
    node "$output_file"
    if [ $? -ne 0 ]; then
        echo "$file failed to run"
        exit $?
    fi
done

popd > /dev/null
