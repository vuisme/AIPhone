package com.aiphone.agent.workflow

import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.javascript.BaseFunction
import org.mozilla.javascript.Context
import org.mozilla.javascript.ContextFactory
import org.mozilla.javascript.NativeArray
import org.mozilla.javascript.NativeObject
import org.mozilla.javascript.Parser
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject
import org.mozilla.javascript.Token
import org.mozilla.javascript.Undefined
import org.mozilla.javascript.ast.ArrayLiteral
import org.mozilla.javascript.ast.Assignment
import org.mozilla.javascript.ast.AstRoot
import org.mozilla.javascript.ast.ConditionalExpression
import org.mozilla.javascript.ast.ElementGet
import org.mozilla.javascript.ast.ExpressionStatement
import org.mozilla.javascript.ast.FunctionCall
import org.mozilla.javascript.ast.InfixExpression
import org.mozilla.javascript.ast.KeywordLiteral
import org.mozilla.javascript.ast.Name
import org.mozilla.javascript.ast.NumberLiteral
import org.mozilla.javascript.ast.ObjectLiteral
import org.mozilla.javascript.ast.ObjectProperty
import org.mozilla.javascript.ast.ParenthesizedExpression
import org.mozilla.javascript.ast.PropertyGet
import org.mozilla.javascript.ast.StringLiteral
import org.mozilla.javascript.ast.UnaryExpression
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.random.Random

class ExpressionEngine(private val random: Random = Random.Default) {
    fun evaluate(rawExpression: String, values: Map<String, RunValue>): Any? {
        val expression = normalizeShorthand(rawExpression.trim())
        require(expression.isNotBlank()) { "Expression cannot be empty" }
        require(expression.length <= MAX_EXPRESSION_LENGTH) { "Expression is too long" }
        validateAst(expression)

        return ContextFactory.getGlobal().call { context ->
            context.optimizationLevel = -1
            val global = context.initSafeStandardObjects()
            ScriptableObject.deleteProperty(global, "eval")
            ScriptableObject.deleteProperty(global, "Function")
            val scope = context.newObject(global).apply {
                prototype = global
                parentScope = null
            }
            values.forEach { (name, value) ->
                ScriptableObject.putProperty(scope, name, toJavaScript(context, scope, value.value))
            }
            installRandom(scope)
            val result = context.evaluateString(scope, "($expression)", "AIPhone expression", 1, null)
            fromJavaScript(result)
        }
    }

    private fun installRandom(scope: Scriptable) {
        val function = object : BaseFunction() {
            override fun call(context: Context, callScope: Scriptable, thisObject: Scriptable, args: Array<out Any>): Any {
                require(args.size == 2) { "random(min, max) requires two arguments" }
                val minimum = ceil(Context.toNumber(args[0])).toLong()
                val maximum = floor(Context.toNumber(args[1])).toLong()
                require(minimum <= maximum) { "random min must be less than or equal to max" }
                require(minimum >= -MAX_RANDOM_ABSOLUTE && maximum <= MAX_RANDOM_ABSOLUTE) { "random range is too large" }
                return random.nextLong(minimum, maximum + 1).toDouble()
            }
        }.apply {
            parentScope = scope
            prototype = ScriptableObject.getFunctionPrototype(scope)
        }
        ScriptableObject.defineProperty(scope, "random", function, ScriptableObject.READONLY or ScriptableObject.PERMANENT)
    }

    private fun validateAst(expression: String) {
        val root = Parser().parse("($expression)", "AIPhone expression", 1)
        var nodeCount = 0
        root.visit { node ->
            require(++nodeCount <= MAX_AST_NODES) { "Expression is too complex" }
            when (node) {
                is Assignment -> reject(node)
                is AstRoot, is ExpressionStatement, is ParenthesizedExpression,
                is NumberLiteral, is StringLiteral, is ArrayLiteral, is ObjectLiteral -> Unit
                is ObjectProperty -> require(node.isNormalMethod.not() && node.isGetterMethod.not() && node.isSetterMethod.not()) {
                    "Object methods are not allowed in expressions"
                }
                is PropertyGet -> require(node.property.identifier !in FORBIDDEN_PROPERTIES) {
                    "Property ${node.property.identifier} is not allowed in expressions"
                }
                is ElementGet -> validateElementAccess(node)
                is FunctionCall -> validateCall(node)
                is ConditionalExpression -> Unit
                is InfixExpression -> require(node.operator in ALLOWED_INFIX_OPERATORS) {
                    "Operator ${Token.typeToName(node.operator)} is not allowed in expressions"
                }
                is UnaryExpression -> require(node.operator in ALLOWED_UNARY_OPERATORS) {
                    "Operator ${Token.typeToName(node.operator)} is not allowed in expressions"
                }
                is KeywordLiteral -> require(node.type in ALLOWED_KEYWORDS) { "Keyword is not allowed in expressions" }
                is Name -> require(node.identifier !in FORBIDDEN_NAMES) { "Name ${node.identifier} is not allowed in expressions" }
                else -> reject(node)
            }
            true
        }
    }

    private fun validateElementAccess(node: ElementGet) {
        val element = node.element
        require(element is NumberLiteral || element is StringLiteral) { "Dynamic property access is not allowed in expressions" }
        if (element is StringLiteral) require(element.value !in FORBIDDEN_PROPERTIES && element.value !in FORBIDDEN_NAMES) {
            "Property ${element.value} is not allowed in expressions"
        }
    }

    private fun validateCall(node: FunctionCall) {
        when (val target = node.target) {
            is Name -> require(target.identifier in ALLOWED_GLOBAL_FUNCTIONS) {
                "Function ${target.identifier} is not allowed in expressions"
            }
            is PropertyGet -> {
                val method = target.property.identifier
                require(method in ALLOWED_METHODS) { "Method $method is not allowed in expressions" }
                if (target.target is Name && (target.target as Name).identifier == "Math") {
                    require(method in ALLOWED_MATH_METHODS) { "Math.$method is not allowed in expressions" }
                }
                if (target.target is Name && (target.target as Name).identifier == "JSON") {
                    require(method == "parse" || method == "stringify") { "JSON.$method is not allowed in expressions" }
                }
            }
            else -> reject(target)
        }
    }

    private fun reject(node: org.mozilla.javascript.ast.AstNode): Nothing =
        throw IllegalArgumentException("${node.javaClass.simpleName} is not allowed in expressions")

    private fun normalizeShorthand(expression: String): String {
        val match = RANDOM_SHORTHAND.matchEntire(expression) ?: return expression
        return "random(${match.groupValues[1]}, ${match.groupValues[2]})"
    }

    private fun toJavaScript(context: Context, scope: Scriptable, value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is Boolean, is Number, is String -> value
        is JSONObject -> context.newObject(scope).also { target ->
            value.keys().forEach { key -> ScriptableObject.putProperty(target, key, toJavaScript(context, scope, value.opt(key))) }
        }
        is JSONArray -> context.newArray(scope, Array(value.length()) { index -> toJavaScript(context, scope, value.opt(index)) })
        is Map<*, *> -> context.newObject(scope).also { target ->
            value.forEach { (key, item) -> ScriptableObject.putProperty(target, key.toString(), toJavaScript(context, scope, item)) }
        }
        is Collection<*> -> context.newArray(scope, value.map { toJavaScript(context, scope, it) }.toTypedArray())
        else -> value.toString()
    }

    private fun fromJavaScript(value: Any?): Any? = when (value) {
        null -> JSONObject.NULL
        Undefined.instance -> error("Expression returned undefined")
        is Boolean, is Number, is String -> value
        is CharSequence -> value.toString()
        is NativeArray -> JSONArray().apply {
            for (index in 0 until value.length.toInt()) put(fromJavaScript(value.get(index, value)))
        }
        is NativeObject -> JSONObject().apply {
            value.ids.forEach { id ->
                val key = id.toString()
                put(key, fromJavaScript(ScriptableObject.getProperty(value, key)))
            }
        }
        else -> error("Expression returned unsupported ${value.javaClass.simpleName}")
    }

    companion object {
        private const val MAX_EXPRESSION_LENGTH = 4_096
        private const val MAX_AST_NODES = 256
        private const val MAX_RANDOM_ABSOLUTE = 1_000_000_000L
        private val RANDOM_SHORTHAND = Regex("^\\(\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)$")
        private val FORBIDDEN_NAMES = setOf(
            "java", "javax", "android", "Packages", "org", "com", "Runtime", "System", "Class",
            "eval", "Function", "globalThis", "window", "self",
        )
        private val FORBIDDEN_PROPERTIES = setOf("constructor", "prototype", "__proto__", "getClass", "class")
        private val ALLOWED_GLOBAL_FUNCTIONS = setOf("random", "parseInt", "parseFloat", "isFinite", "isNaN", "String", "Number", "Boolean")
        private val ALLOWED_MATH_METHODS = setOf("abs", "ceil", "floor", "round", "min", "max", "pow", "sqrt")
        private val ALLOWED_METHODS = ALLOWED_MATH_METHODS + setOf(
            "toUpperCase", "toLowerCase", "trim", "includes", "startsWith", "endsWith", "substring", "slice",
            "indexOf", "lastIndexOf", "replace", "concat", "join", "parse", "stringify", "toString",
        )
        private val ALLOWED_INFIX_OPERATORS = setOf(
            Token.ADD, Token.SUB, Token.MUL, Token.DIV, Token.MOD,
            Token.EQ, Token.NE, Token.SHEQ, Token.SHNE, Token.LT, Token.LE, Token.GT, Token.GE,
            Token.AND, Token.OR, Token.BITAND, Token.BITOR, Token.BITXOR, Token.LSH, Token.RSH, Token.URSH,
        )
        private val ALLOWED_UNARY_OPERATORS = setOf(Token.NOT, Token.NEG, Token.POS, Token.BITNOT, Token.TYPEOF)
        private val ALLOWED_KEYWORDS = setOf(Token.TRUE, Token.FALSE, Token.NULL)
    }
}
